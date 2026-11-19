package alwayson_test

import (
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/aleh11/airtime/internal/alwayson"
	"github.com/aleh11/airtime/internal/broadcast"
	"github.com/aleh11/airtime/internal/store"
)

type fakeRunner struct {
	started  [][]string
	stopped  int
	running  bool
	startErr error
}

func (f *fakeRunner) Start(args []string) error {
	if f.startErr != nil {
		return f.startErr
	}
	f.started = append(f.started, args)
	f.running = true
	return nil
}
func (f *fakeRunner) Stop()         { f.stopped++; f.running = false }
func (f *fakeRunner) Running() bool { return f.running }

// fakeClock moves wall and monotonic time together, unless the wall clock is
// stepped on its own.
type fakeClock struct {
	wall time.Time
	mono time.Duration
}

func (c *fakeClock) Wall() time.Time          { return c.wall }
func (c *fakeClock) Mono() time.Duration      { return c.mono }
func (c *fakeClock) advance(d time.Duration)  { c.wall = c.wall.Add(d); c.mono += d }
func (c *fakeClock) stepWall(d time.Duration) { c.wall = c.wall.Add(d) }

type rig struct {
	t       *testing.T
	store   *store.Store
	runner  *fakeRunner
	ctl     *broadcast.Controller
	clock   *fakeClock
	synced  bool
	temp    float64
	tempErr error
	sup     *alwayson.Supervisor
}

func newRig(t *testing.T) *rig {
	t.Helper()
	s, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { s.Close() })

	r := &rig{
		t:      t,
		store:  s,
		runner: &fakeRunner{},
		clock:  &fakeClock{wall: time.Date(2026, 11, 17, 9, 14, 0, 0, time.UTC)},
		synced: true,
		temp:   50,
	}
	r.ctl = broadcast.New(s, r.runner, r.clock.Wall)
	r.sup = alwayson.New(alwayson.Options{
		Store:        s,
		Broadcaster:  r.ctl,
		ClockTrusted: func() bool { return r.synced },
		Temperature:  func() (float64, error) { return r.temp, r.tempErr },
		Clock:        r.clock,
	})
	return r
}

func (r *rig) setting(category, key, value string) {
	r.t.Helper()
	if err := r.store.SetSetting(category, key, value); err != nil {
		r.t.Fatalf("set %s.%s: %v", category, key, err)
	}
}

func (r *rig) enable()  { r.setting("app_config", "always_on_enabled", "true") }
func (r *rig) disable() { r.setting("app_config", "always_on_enabled", "false") }

// exit simulates txtempus dying, the way the daemon's onExit hook reports it.
func (r *rig) exit() {
	r.runner.running = false
	r.ctl.Finished()
}

func (r *rig) wantState(state string) {
	r.t.Helper()
	if got := r.sup.Status().State; got != state {
		r.t.Fatalf("state = %q, want %q", got, state)
	}
	var published alwayson.Status
	r.store.Status("always_on", "status", &published)
	if published.State != state {
		r.t.Fatalf("published state = %q, want %q", published.State, state)
	}
}

func (r *rig) wantStarts(n int) {
	r.t.Helper()
	if len(r.runner.started) != n {
		r.t.Fatalf("started %d times, want %d: %v", len(r.runner.started), n, r.runner.started)
	}
}

func TestDisabledDoesNothing(t *testing.T) {
	r := newRig(t)
	r.sup.Tick()
	r.wantState(alwayson.StateOff)
	r.wantStarts(0)
}

func TestWaitsForTimeSyncThenStarts(t *testing.T) {
	r := newRig(t)
	r.synced = false
	r.enable()

	r.sup.Tick()
	r.wantState(alwayson.StateWaiting)
	r.wantStarts(0)

	r.synced = true
	r.clock.advance(5 * time.Second)
	r.sup.Tick()
	r.wantState(alwayson.StateOnAir)
	r.wantStarts(1)

	want := []string{"/usr/bin/txtempus", "-s", "DCF77"}
	if !slices.Equal(r.runner.started[0], want) {
		t.Fatalf("command %v, want %v (no -r: no end)", r.runner.started[0], want)
	}
	if r.sup.Status().Since != "2026-11-17T09:14:05Z" {
		t.Fatalf("since = %q", r.sup.Status().Since)
	}
}

// Once chrony has set the clock it free-runs fine without the network, so a
// lost network must not take the broadcast off the air.
func TestLosingSyncLaterKeepsBroadcasting(t *testing.T) {
	r := newRig(t)
	r.enable()
	r.sup.Tick()

	r.synced = false
	r.clock.advance(time.Hour)
	r.sup.Tick()
	r.wantState(alwayson.StateOnAir)

	r.exit()
	r.sup.Tick()
	r.wantState(alwayson.StateOnAir)
	r.wantStarts(2)
}

func TestUsesTheAlwaysOnStandardAndOffsetButNotFixedTime(t *testing.T) {
	r := newRig(t)
	r.setting("radio_config", "default_offset", "60")
	r.setting("radio_config", "default_offset_enabled", "true")
	r.setting("radio_config", "default_time_mode", "fixed_time")
	r.setting("radio_config", "default_fixed_time", "09:30")
	r.setting("always_on", "standard", "MSF")
	r.enable()

	r.sup.Tick()
	want := []string{"/usr/bin/txtempus", "-s", "MSF", "-z", "60"}
	if !slices.Equal(r.runner.started[0], want) {
		t.Fatalf("command %v, want %v", r.runner.started[0], want)
	}
}

func TestDisablingStopsIt(t *testing.T) {
	r := newRig(t)
	r.enable()
	r.sup.Tick()

	r.disable()
	r.sup.Tick()
	r.wantState(alwayson.StateOff)
	if r.runner.stopped != 1 || r.runner.running {
		t.Fatalf("transmitter not stopped (stopped=%d running=%v)", r.runner.stopped, r.runner.running)
	}
}

func TestNeverStopsSomeoneElsesBroadcast(t *testing.T) {
	r := newRig(t)
	r.ctl.Start(broadcast.DefaultRequest(r.store))

	r.sup.Tick()
	if r.runner.stopped != 0 {
		t.Fatal("a disabled supervisor stopped a manual broadcast")
	}
}

func TestRestartsAfterTheTransmitterExits(t *testing.T) {
	r := newRig(t)
	r.enable()
	r.sup.Tick()

	r.clock.advance(2 * time.Hour)
	r.exit()
	r.sup.Tick()

	r.wantState(alwayson.StateOnAir)
	r.wantStarts(2)
	if got := r.sup.Status().Restarts; got != 1 {
		t.Fatalf("restarts = %d, want 1", got)
	}
}

func TestBacksOffWhenItKeepsDying(t *testing.T) {
	r := newRig(t)
	r.enable()
	r.sup.Tick()
	r.wantStarts(1)

	for i, wait := range []time.Duration{5 * time.Second, 10 * time.Second, 20 * time.Second, 40 * time.Second} {
		r.clock.advance(3 * time.Second)
		r.exit()
		r.sup.Tick()
		r.wantState(alwayson.StateBackoff)
		if r.sup.Status().LastError == "" || r.sup.Status().RetryAt == "" {
			t.Fatalf("backoff %d: no error or retry time recorded: %+v", i, r.sup.Status())
		}

		r.clock.advance(wait - time.Second)
		r.sup.Tick()
		r.wantStarts(i + 1)

		r.clock.advance(time.Second)
		r.sup.Tick()
		r.wantState(alwayson.StateOnAir)
		r.wantStarts(i + 2)
	}
}

func TestBackoffIsCappedAndResetsAfterHealthyRunning(t *testing.T) {
	r := newRig(t)
	r.enable()
	r.sup.Tick()

	// Fail often enough to reach the cap.
	for i := 0; i < 12; i++ {
		r.clock.advance(time.Second)
		r.exit()
		r.sup.Tick()
		r.clock.advance(5 * time.Minute)
		r.sup.Tick()
	}
	r.wantState(alwayson.StateOnAir)

	// Ten healthy minutes forget the failures, so the next quick failure
	// waits 5s again instead of 5min.
	r.clock.advance(11 * time.Minute)
	r.sup.Tick()
	r.exit()
	r.sup.Tick() // a long run that ended: restarted at once
	r.wantState(alwayson.StateOnAir)

	r.clock.advance(3 * time.Second)
	r.exit()
	r.sup.Tick()
	r.wantState(alwayson.StateBackoff)
	starts := len(r.runner.started)
	r.clock.advance(5 * time.Second)
	r.sup.Tick()
	r.wantStarts(starts + 1)
}

func TestAFailedStartBacksOff(t *testing.T) {
	r := newRig(t)
	r.runner.startErr = errors.New("gpio busy")
	r.enable()

	r.sup.Tick()
	r.wantState(alwayson.StateBackoff)
	if got := r.sup.Status().LastError; got == "" {
		t.Fatal("last error not recorded")
	}

	r.runner.startErr = nil
	r.clock.advance(5 * time.Second)
	r.sup.Tick()
	r.wantState(alwayson.StateOnAir)
}

func TestRestartsWhenTheWallClockSteps(t *testing.T) {
	r := newRig(t)
	r.enable()
	r.sup.Tick()

	r.clock.advance(5 * time.Second)
	r.sup.Tick()
	r.wantStarts(1)

	r.clock.advance(5 * time.Second)
	r.clock.stepWall(-90 * time.Minute)
	r.sup.Tick()
	r.wantStarts(2)
	r.wantState(alwayson.StateOnAir)

	// Small drift is not a step.
	r.clock.advance(5 * time.Second)
	r.clock.stepWall(time.Second)
	r.sup.Tick()
	r.wantStarts(2)
}

func TestRestartsWhenTheOffsetChanges(t *testing.T) {
	r := newRig(t)
	r.enable()
	r.sup.Tick()
	since := r.sup.Status().Since

	r.setting("radio_config", "default_offset", "-60")
	r.setting("radio_config", "default_offset_enabled", "true")
	r.clock.advance(5 * time.Second)
	r.sup.Tick()

	r.wantStarts(2)
	want := []string{"/usr/bin/txtempus", "-s", "DCF77", "-z", "-60"}
	if !slices.Equal(r.runner.started[1], want) {
		t.Fatalf("command %v, want %v", r.runner.started[1], want)
	}
	if r.sup.Status().Since != since {
		t.Fatal("a planned restart reset the on-air time")
	}
}

func TestPausesWhenTooHotAndResumesWithHysteresis(t *testing.T) {
	r := newRig(t)
	r.enable()
	r.sup.Tick()

	r.temp = 86
	r.clock.advance(5 * time.Second)
	r.sup.Tick()
	r.wantState(alwayson.StateThermalPause)
	if r.runner.running {
		t.Fatal("still transmitting while too hot")
	}

	r.temp = 80
	r.clock.advance(5 * time.Second)
	r.sup.Tick()
	r.wantState(alwayson.StateThermalPause)

	r.temp = 75
	r.clock.advance(5 * time.Second)
	r.sup.Tick()
	r.wantState(alwayson.StateOnAir)
	r.wantStarts(2)
}

func TestThermalCutoffCanBeDisabled(t *testing.T) {
	r := newRig(t)
	r.setting("always_on", "thermal_cutoff_c", "0")
	r.temp = 95
	r.enable()
	r.sup.Tick()
	r.wantState(alwayson.StateOnAir)
}

func TestTakesOverFromAStrayTransmitter(t *testing.T) {
	r := newRig(t)
	r.runner.running = true // a txtempus nobody recorded
	r.enable()

	r.sup.Tick()
	if r.runner.stopped != 1 {
		t.Fatal("stray transmitter was not stopped first")
	}
	r.wantState(alwayson.StateOnAir)
	r.wantStarts(1)
}
