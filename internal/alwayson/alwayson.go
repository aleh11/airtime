// Package alwayson keeps a continuous broadcast on the air from power-on
// until the mode is turned off.
package alwayson

import (
	"context"
	"fmt"
	"log/slog"
	"slices"
	"strconv"
	"time"

	"github.com/aleh11/airtime/internal/broadcast"
	"github.com/aleh11/airtime/internal/store"
	"github.com/aleh11/airtime/internal/transmit"
)

// States reported in status.always_on.state.
const (
	StateOff          = "off"
	StateWaiting      = "waiting_for_sync"
	StateOnAir        = "on_air"
	StateBackoff      = "backoff"
	StateThermalPause = "thermal_pause"
)

const (
	checkInterval = 5 * time.Second

	// A txtempus that dies sooner than this is failing, not finishing.
	quickExit      = 60 * time.Second
	firstBackoff   = 5 * time.Second
	maxBackoff     = 5 * time.Minute
	healthyRunning = 10 * time.Minute

	// The wall clock and the monotonic clock may drift apart by this much
	// between checks before we call it a step. txtempus schedules every
	// edge against the wall clock, so after a step it sends garbage
	// (forward) or goes silent (backward) until restarted.
	maxClockStep = 2 * time.Second

	defaultThermalCutoff = 85
	thermalHysteresis    = 10
	thermalWarning       = 80
)

// Broadcaster is the part of broadcast.Controller the supervisor drives.
type Broadcaster interface {
	StartAlwaysOn(req transmit.Request) error
	Stop()
	Running() bool
}

// Clock separates wall time, which is what gets broadcast and can jump, from
// monotonic time, which only moves forward and measures real elapsed time.
type Clock interface {
	Wall() time.Time
	Mono() time.Duration
}

type systemClock struct{ origin time.Time }

func (c systemClock) Wall() time.Time     { return time.Now().Round(0) }
func (c systemClock) Mono() time.Duration { return time.Since(c.origin) }

// SystemClock is the real clock.
func SystemClock() Clock { return systemClock{origin: time.Now()} }

// Status is what the supervisor publishes in status.always_on.
type Status struct {
	State     string `json:"state"`
	Since     string `json:"since,omitempty"`
	LastError string `json:"last_error,omitempty"`
	Restarts  int    `json:"restarts"`
	RetryAt   string `json:"retry_at,omitempty"`
}

type Supervisor struct {
	store        *store.Store
	broadcaster  Broadcaster
	clockTrusted func() bool
	temperature  func() (float64, error)
	clock        Clock
	log          *slog.Logger
	wake         chan struct{}

	status    Status
	published *Status

	// Once chrony has set the clock it stays good without the network (it
	// free-runs), so trust is needed only once per daemon lifetime. Steps
	// are caught separately.
	trusted        bool
	warnedNoSync   bool
	warnedHot      bool
	running        []string // command of the broadcast we started
	startedAt      time.Duration
	failures       int
	retryAt        time.Duration
	lastWall       time.Time
	lastMono       time.Duration
	haveLastSample bool
}

type Options struct {
	Store       *store.Store
	Broadcaster Broadcaster
	// ClockTrusted reports whether chrony has set the clock.
	ClockTrusted func() bool
	// Temperature reads the SoC temperature in °C.
	Temperature func() (float64, error)
	Clock       Clock
	Log         *slog.Logger
}

func New(o Options) *Supervisor {
	if o.Clock == nil {
		o.Clock = SystemClock()
	}
	if o.Log == nil {
		o.Log = slog.Default()
	}
	if o.Temperature == nil {
		o.Temperature = func() (float64, error) { return 0, fmt.Errorf("no thermal sensor") }
	}
	s := &Supervisor{
		store:        o.Store,
		broadcaster:  o.Broadcaster,
		clockTrusted: o.ClockTrusted,
		temperature:  o.Temperature,
		clock:        o.Clock,
		log:          o.Log,
		wake:         make(chan struct{}, 1),
		status:       Status{State: StateOff},
	}
	s.publish()
	return s
}

// Run checks every few seconds, and at once whenever Wake is called.
func (s *Supervisor) Run(ctx context.Context) {
	ticker := time.NewTicker(checkInterval)
	defer ticker.Stop()
	s.Tick()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		case <-s.wake:
		}
		s.Tick()
	}
}

// Wake asks for a check now: after the mode or the settings change, or when
// txtempus exits. It never blocks.
func (s *Supervisor) Wake() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

// Status is the last published state. Only safe from the goroutine running
// Tick (tests); everything else reads status.always_on from the store.
func (s *Supervisor) Status() Status { return s.status }

// Tick is one pass of the supervisor. Run calls it; tests call it directly.
func (s *Supervisor) Tick() {
	stepped := s.clockStepped()

	if !s.enabled() {
		if s.status.State != StateOff {
			s.stopOurs()
			s.failures = 0
			s.set(StateOff)
		}
		return
	}

	if !s.trusted {
		if s.requireSync() && !s.clockTrusted() {
			s.set(StateWaiting)
			return
		}
		if !s.requireSync() && !s.warnedNoSync {
			s.log.Warn("always on: require_time_sync is off; broadcasting a clock nobody has checked")
			s.warnedNoSync = true
		}
		s.trusted = true
	}

	if s.tooHot() {
		return
	}

	want := s.command()
	mono := s.clock.Mono()

	if s.running != nil && s.broadcaster.Running() && s.ours() {
		switch {
		case stepped:
			s.log.Warn("always on: wall clock stepped; restarting the transmitter")
		case !slices.Equal(s.running, want):
			s.log.Info("always on: settings changed; restarting the transmitter")
		default:
			if s.failures > 0 && mono-s.startedAt >= healthyRunning {
				s.failures = 0
			}
			s.set(StateOnAir)
			return
		}
		s.start(mono)
		return
	}

	// We started one and it is gone: it exited or something replaced it.
	if s.running != nil {
		ran := mono - s.startedAt
		s.running = nil
		s.status.Restarts++
		if ran < quickExit {
			s.fail(mono, fmt.Sprintf("transmitter exited after %s", ran.Round(time.Second)))
			return
		}
		s.log.Warn("always on: transmitter exited; restarting", "ran", ran.Round(time.Second))
	}

	if s.status.State == StateBackoff && mono < s.retryAt {
		return
	}

	// Something else is on the air (a stray txtempus, or a broadcast that
	// slipped past the guards). Always On owns the transmitter while enabled.
	if s.broadcaster.Running() {
		s.broadcaster.Stop()
	}
	s.start(mono)
}

func (s *Supervisor) start(mono time.Duration) {
	req := s.request()
	if err := s.broadcaster.StartAlwaysOn(req); err != nil {
		s.running = nil
		s.fail(mono, err.Error())
		return
	}
	s.running = s.command()
	s.startedAt = mono
	if s.status.State != StateOnAir {
		s.status.Since = s.clock.Wall().Format(time.RFC3339)
	}
	s.set(StateOnAir)
}

func (s *Supervisor) fail(mono time.Duration, reason string) {
	s.failures++
	wait := firstBackoff << (s.failures - 1)
	if wait > maxBackoff || wait <= 0 {
		wait = maxBackoff
	}
	s.retryAt = mono + wait
	s.status.LastError = reason
	s.status.RetryAt = s.clock.Wall().Add(wait).Format(time.RFC3339)
	s.log.Error("always on: transmitter failed", "reason", reason, "retry_in", wait)
	s.set(StateBackoff)
}

func (s *Supervisor) tooHot() bool {
	cutoff := s.thermalCutoff()
	temp, err := s.temperature()
	if cutoff <= 0 || err != nil {
		return false
	}

	if temp >= thermalWarning && !s.warnedHot {
		s.log.Warn("always on: running hot", "celsius", temp)
		s.warnedHot = true
	} else if temp < thermalWarning {
		s.warnedHot = false
	}

	if s.status.State == StateThermalPause {
		if temp > float64(cutoff-thermalHysteresis) {
			s.status.LastError = fmt.Sprintf("too hot (%.0f°C)", temp)
			s.publish()
			return true
		}
		s.log.Info("always on: cooled down; resuming", "celsius", temp)
		return false
	}

	if temp >= float64(cutoff) {
		s.log.Warn("always on: too hot; pausing", "celsius", temp, "cutoff", cutoff)
		s.stopOurs()
		s.status.LastError = fmt.Sprintf("too hot (%.0f°C)", temp)
		s.set(StateThermalPause)
		return true
	}
	return false
}

// clockStepped compares how far the wall clock moved with how much time
// actually passed since the previous check.
func (s *Supervisor) clockStepped() bool {
	wall, mono := s.clock.Wall(), s.clock.Mono()
	defer func() { s.lastWall, s.lastMono, s.haveLastSample = wall, mono, true }()
	if !s.haveLastSample {
		return false
	}
	drift := wall.Sub(s.lastWall) - (mono - s.lastMono)
	return drift > maxClockStep || drift < -maxClockStep
}

func (s *Supervisor) stopOurs() {
	if s.running != nil || s.ours() {
		s.broadcaster.Stop()
	}
	s.running = nil
}

// ours reports whether the broadcast on record is an always-on one, so the
// supervisor never stops a broadcast somebody else started.
func (s *Supervisor) ours() bool {
	var details broadcast.Details
	found, err := s.store.Status("services", "txtempus_details", &details)
	return err == nil && found && details.AlwaysOn
}

// set moves to a state. Since is when the current state began; for on_air it
// is when the broadcast went on air, which planned restarts do not reset.
func (s *Supervisor) set(state string) {
	if s.status.State != state {
		switch state {
		case StateOff, StateWaiting:
			s.status.Since = ""
		case StateBackoff, StateThermalPause:
			s.status.Since = s.clock.Wall().Format(time.RFC3339)
		}
		s.status.State = state
	}
	if state != StateBackoff {
		s.status.RetryAt = ""
	}
	s.publish()
}

// publish writes the status only when it changed: the supervisor checks
// every few seconds and the SD card should not be written that often.
func (s *Supervisor) publish() {
	if s.published != nil && *s.published == s.status {
		return
	}
	if err := s.store.SetStatus("always_on", "status", s.status); err != nil {
		s.log.Error("always on: record status", "error", err)
		return
	}
	snapshot := s.status
	s.published = &snapshot
}

func (s *Supervisor) enabled() bool {
	v, _, _ := s.store.Setting("app_config", "always_on_enabled")
	return v == "true"
}

func (s *Supervisor) requireSync() bool {
	v, ok, _ := s.store.Setting("always_on", "require_time_sync")
	return !ok || v != "false"
}

func (s *Supervisor) thermalCutoff() int {
	v, ok, _ := s.store.Setting("always_on", "thermal_cutoff_c")
	if !ok {
		return defaultThermalCutoff
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return defaultThermalCutoff
	}
	return n
}

// request is the broadcast the settings currently ask for: the dashboard's
// offset, the Always On standard, real time, no end.
func (s *Supervisor) request() transmit.Request {
	req := broadcast.DefaultRequest(s.store)
	if v, ok, _ := s.store.Setting("always_on", "standard"); ok && v != "" {
		req.Standard = v
	}
	return broadcast.AlwaysOnRequest(req)
}

func (s *Supervisor) command() []string {
	return transmit.Command(s.request(), time.Time{})
}
