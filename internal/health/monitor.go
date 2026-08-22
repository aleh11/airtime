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
	pollInterval    = 15 * time.Second
	heartbeatPeriod = 2 * time.Second
	pingTarget      = "1.1.1.1"
)

// Monitor keeps the status table and the hat's LEDs in step with reality.
type Monitor struct {
	store *store.Store
	leds  gpio.Controller
	log   *slog.Logger

	transmitting func() bool
}

func NewMonitor(s *store.Store, leds gpio.Controller, transmitting func() bool) *Monitor {
	return &Monitor{store: s, leds: leds, log: slog.Default(), transmitting: transmitting}
}

func (m *Monitor) Run(ctx context.Context) {
	poll := time.NewTicker(pollInterval)
	defer poll.Stop()
	heartbeat := time.NewTicker(heartbeatPeriod)
	defer heartbeat.Stop()

	m.sample(ctx)

	lit := false
	for {
		select {
		case <-ctx.Done():
			m.setLED(gpio.Heartbeat, false)
			return
		case <-poll.C:
			m.sample(ctx)
		case <-heartbeat.C:
			lit = !lit
			m.setLED(gpio.Heartbeat, lit)
		}
	}
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

	m.setLED(gpio.NTP, ntp.Synced)
	if m.transmitting != nil {
		m.setLED(gpio.Antenna, m.transmitting())
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
	if stealth, _, _ := m.store.Setting("app_config", "stealth_mode"); stealth == "true" {
		on = false
	}
	if err := m.leds.Set(led, on); err != nil {
		m.log.Error("set led", "led", led, "error", err)
	}
}
