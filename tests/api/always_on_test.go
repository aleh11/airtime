package api_test

import (
	"net/http"
	"testing"

	"github.com/aleh11/airtime/internal/transmit"
)

func TestAlwaysOnIsOffByDefault(t *testing.T) {
	h, _, _ := newServer(t)

	rec := do(t, h, http.MethodGet, "/api/control/always-on", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	got := decode(t, rec)
	if got["enabled"] != false || got["state"] != "off" || got["standard"] != "DCF77" {
		t.Fatalf("got %v", got)
	}
	if got["require_time_sync"] != true || got["thermal_cutoff_c"] != float64(85) {
		t.Fatalf("defaults wrong: %v", got)
	}
}

func TestEnablingAlwaysOnPersistsAndValidates(t *testing.T) {
	h, s, _ := newServer(t)

	if rec := do(t, h, http.MethodPost, "/api/control/always-on", `{"enabled":true,"service":"NOPE"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("unknown standard: status %d, want 400", rec.Code)
	}

	rec := do(t, h, http.MethodPost, "/api/control/always-on", `{"enabled":true,"service":"MSF"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	got := decode(t, rec)
	if got["enabled"] != true || got["standard"] != "MSF" {
		t.Fatalf("got %v", got)
	}
	if v, _, _ := s.Setting("app_config", "always_on_enabled"); v != "true" {
		t.Fatalf("always_on_enabled = %q, want true", v)
	}
	if v, _, _ := s.Setting("always_on", "standard"); v != "MSF" {
		t.Fatalf("standard = %q, want MSF", v)
	}
}

func TestEnablingWithoutAStandardUsesTheDashboardDefault(t *testing.T) {
	h, s, _ := newServer(t)
	s.SetSetting("radio_config", "default_service", "WWVB")

	got := decode(t, do(t, h, http.MethodPost, "/api/control/always-on", `{"enabled":true}`))
	if got["standard"] != "WWVB" {
		t.Fatalf("standard = %v, want WWVB", got["standard"])
	}
}

func TestEnablingWakesTheSupervisor(t *testing.T) {
	h, _, _, wakes := newServerWithWake(t)

	do(t, h, http.MethodPost, "/api/control/always-on", `{"enabled":true}`)
	do(t, h, http.MethodPost, "/api/control/always-on", `{"enabled":false}`)
	if *wakes != 2 {
		t.Fatalf("woke %d times, want 2", *wakes)
	}
}

func TestManualTransmitConflictsWithAlwaysOn(t *testing.T) {
	h, _, runner := newServer(t)
	do(t, h, http.MethodPost, "/api/control/always-on", `{"enabled":true}`)

	rec := do(t, h, http.MethodPost, "/api/control/transmit", `{"service":"DCF77","duration":10}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status %d, want 409", rec.Code)
	}
	if len(runner.started) != 0 {
		t.Fatal("a manual broadcast started while Always On was enabled")
	}
}

func TestTimeTesterConflictsWithAlwaysOn(t *testing.T) {
	h, _, _ := newServer(t)
	do(t, h, http.MethodPost, "/api/control/always-on", `{"enabled":true}`)

	rec := do(t, h, http.MethodPost, "/api/control/time-tester", `{"enabled":true,"service":"DCF77","duration_hours":1}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status %d, want 409", rec.Code)
	}
}

func TestEnablingAlwaysOnEndsTheTimeTester(t *testing.T) {
	h, s, runner := newServer(t)
	do(t, h, http.MethodPost, "/api/control/time-tester", `{"enabled":true,"service":"DCF77","duration_hours":1}`)

	do(t, h, http.MethodPost, "/api/control/always-on", `{"enabled":true}`)
	if v, _, _ := s.Setting("app_config", "time_tester_active"); v == "true" {
		t.Fatal("time tester still active")
	}
	if runner.running {
		t.Fatal("tester broadcast still running")
	}
}

func TestStopTurnsAlwaysOnOff(t *testing.T) {
	h, s, ctl, runner := newServerWithController(t)
	do(t, h, http.MethodPost, "/api/control/always-on", `{"enabled":true}`)
	ctl.StartAlwaysOn(transmit.Request{Standard: "DCF77"})

	if rec := do(t, h, http.MethodPost, "/api/control/stop", ""); rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	if v, _, _ := s.Setting("app_config", "always_on_enabled"); v != "false" {
		t.Fatalf("always_on_enabled = %q after stop, want false", v)
	}
	if runner.running {
		t.Fatal("still transmitting after stop")
	}
}

func TestDisablingStopsOnlyAnAlwaysOnBroadcast(t *testing.T) {
	h, _, ctl, runner := newServerWithController(t)
	ctl.Start(transmit.Request{Standard: "DCF77", DurationMinutes: 10, TimeMode: "time_now"})

	do(t, h, http.MethodPost, "/api/control/always-on", `{"enabled":false}`)
	if !runner.running {
		t.Fatal("turning Always On off stopped a manual broadcast")
	}
}

func TestStatusReportsAlwaysOn(t *testing.T) {
	h, s, ctl, _ := newServerWithController(t)
	do(t, h, http.MethodPost, "/api/control/always-on", `{"enabled":true,"service":"JJY60"}`)
	ctl.StartAlwaysOn(transmit.Request{Standard: "JJY60"})
	s.SetStatus("always_on", "status", map[string]any{"state": "on_air", "since": "2026-08-22T09:14:00Z"})

	got := decode(t, do(t, h, http.MethodGet, "/api/status", ""))
	block, _ := got["always_on"].(map[string]any)
	if block["enabled"] != true || block["state"] != "on_air" || block["since"] != "2026-08-22T09:14:00Z" || block["standard"] != "JJY60" {
		t.Fatalf("always_on block = %v", block)
	}
	services, _ := got["services"].(map[string]any)
	if services["txtempus_always_on"] != true {
		t.Fatalf("services.txtempus_always_on = %v", services["txtempus_always_on"])
	}
	if services["txtempus_remaining_seconds"] != float64(0) || services["txtempus_duration"] != float64(0) {
		t.Fatalf("always on has no countdown: %v", services)
	}
}

func TestStatusNeverReportsADisabledModeAsRunning(t *testing.T) {
	h, s, _ := newServer(t)
	s.SetStatus("always_on", "status", map[string]any{"state": "on_air"})

	got := decode(t, do(t, h, http.MethodGet, "/api/status", ""))
	block, _ := got["always_on"].(map[string]any)
	if block["state"] != "off" {
		t.Fatalf("state = %v, want off", block["state"])
	}
}
