package health

import (
	"context"
	"log/slog"
	"os/exec"
	"time"

	"github.com/aleh11/airtime/internal/gpio"
	"github.com/aleh11/airtime/internal/store"
)

const (
	pollInterval = 15 * time.Second
	// The LEDs are driven far faster than they are sampled: a flash is 100ms, so
	// anything slower than this would smear the pattern, and the antenna LED has
	// to answer a button press rather than wait for the next poll.
	ledInterval     = 50 * time.Millisecond
	stealthInterval = time.Second
	pingTarget      = "1.1.1.1"
)

// Monitor keeps the status table and the hat's LEDs in step with reality.
type Monitor struct {
	store *store.Store
	leds  gpio.Controller
	log   *slog.Logger

	transmitting func() bool

	heartbeat Blinker
	ntp       Blinker

	stealth   bool
	stealthAt time.Time
	lastState map[gpio.LED]bool

	transmitState *bool
}

func NewMonitor(s *store.Store, leds gpio.Controller, transmitting func() bool) *Monitor {
	return &Monitor{
		store:        s,
		leds:         leds,
		log:          slog.Default(),
		transmitting: transmitting,
		lastState:    map[gpio.LED]bool{},
	}
}

func (m *Monitor) Run(ctx context.Context) {
	poll := time.NewTicker(pollInterval)
	defer poll.Stop()
	leds := time.NewTicker(ledInterval)
	defer leds.Stop()

	m.sample(ctx)

	for {
		select {
		case <-ctx.Done():
			m.setLED(gpio.Heartbeat, false)
			m.setLED(gpio.NTP, false)
			m.setLED(gpio.Antenna, false)
			return
		case <-poll.C:
			m.sample(ctx)
		case now := <-leds.C:
			m.driveLEDs(now)
		}
	}
}

func (m *Monitor) driveLEDs(now time.Time) {
	m.setLED(gpio.Heartbeat, m.heartbeat.State(now))
	m.setLED(gpio.NTP, m.ntp.State(now))
	if m.transmitting == nil {
		return
	}

	transmitting := m.transmitting()
	m.setLED(gpio.Antenna, transmitting)
	m.recordTransmitting(transmitting)
}

// recordTransmitting keeps the stored flag in step with what is actually on
// air. The broadcast controller writes it when it starts and stops something,
// but a txtempus it did not start — left by a crash, or run by hand — would
// otherwise transmit with the dashboard reporting nothing. The original
// implementation wrote this from its own process check for the same reason.
func (m *Monitor) recordTransmitting(transmitting bool) {
	if m.transmitState != nil && *m.transmitState == transmitting {
		return
	}
	if err := m.store.SetStatus("services", "txtempus_running", transmitting); err != nil {
		m.log.Error("record transmitter state", "error", err)
		return
	}
	m.transmitState = &transmitting
}

func (m *Monitor) sample(ctx context.Context) {
	ntp := m.readNTP(ctx)
	m.store.SetStatus("ntp_status", "synced", ntp.Synced)
	m.store.SetStatus("ntp_status", "score", ntp.Score)
	m.store.SetStatus("ntp_status", "last_rx_seconds", ntp.LastRxSeconds)
	m.store.SetStatus("ntp_status", "server", ntp.Server)

	ping := m.readPing(ctx)
	m.store.SetStatus("internet_status", "connected", ping.Connected)
	m.store.SetStatus("internet_status", "score", ping.Score)
	m.store.SetStatus("internet_status", "ping_ms", ping.LatencyMS)

	// A score is only meaningful while the thing it scores is reachable, so an
	// unsynchronised clock or a dead link leaves its LED dark rather than
	// pulsing at whatever the last good reading was.
	if ntp.Synced {
		m.ntp.Interval = ScoreInterval(ntp.Score)
	} else {
		m.ntp.Interval = 0
	}
	if ping.Connected {
		m.heartbeat.Interval = ScoreInterval(ping.Score)
	} else {
		m.heartbeat.Interval = 0
	}
}

func (m *Monitor) readNTP(ctx context.Context) NTP {
	output, err := exec.CommandContext(ctx, "chronyc", "-n", "sources").Output()
	if err != nil {
		return NTP{LastRxSeconds: 9999, Server: "unknown"}
	}
	return ParseChronySources(string(output))
}

func (m *Monitor) readPing(ctx context.Context) Ping {
	output, err := exec.CommandContext(ctx, "ping", "-c", "1", "-W", "6", pingTarget).Output()
	if err != nil {
		return Ping{}
	}
	return ParsePing(string(output))
}

// setLED honours stealth mode, which suppresses the hat's LEDs without
// affecting anything being transmitted.
func (m *Monitor) setLED(led gpio.LED, on bool) {
	if m.leds == nil {
		return
	}
	if m.stealthMode() {
		on = false
	}
	// The LEDs are driven twenty times a second; only the changes are worth
	// pushing at the kernel.
	if previous, seen := m.lastState[led]; seen && previous == on {
		return
	}
	m.lastState[led] = on
	if err := m.leds.Set(led, on); err != nil {
		m.log.Error("set led", "led", led, "error", err)
	}
}

// stealthMode caches the setting: it is consulted on every LED tick, which is
// far too often to be reading the database.
func (m *Monitor) stealthMode() bool {
	if now := time.Now(); now.Sub(m.stealthAt) >= stealthInterval {
		stealth, _, _ := m.store.Setting("app_config", "stealth_mode")
		m.stealth = stealth == "true"
		m.stealthAt = now
	}
	return m.stealth
}
