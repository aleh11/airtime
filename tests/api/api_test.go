package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/aleh11/airtime/internal/api"
	"github.com/aleh11/airtime/internal/broadcast"
	"github.com/aleh11/airtime/internal/metrics"
	"github.com/aleh11/airtime/internal/store"
)

// fakeRunner stands in for the txtempus process only; the API is tested
// through the real broadcast controller so that status recording is covered.
type fakeRunner struct {
	started [][]string
	stopped int
	running bool
}

func (f *fakeRunner) Start(args []string) error {
	f.started = append(f.started, args)
	f.running = true
	return nil
}
func (f *fakeRunner) Stop()         { f.stopped++; f.running = false }
func (f *fakeRunner) Running() bool { return f.running }

type fakeMetrics struct{}

func (fakeMetrics) Snapshot() metrics.Snapshot {
	return metrics.Snapshot{Temperature: 42.5}
}

func newServer(t *testing.T) (http.Handler, *store.Store, *fakeRunner) {
	t.Helper()
	s, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { s.Close() })

	runner := &fakeRunner{}
	now := func() time.Time { return time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC) }
	handler := api.New(api.Deps{
		Store:   s,
		Runner:  broadcast.New(s, runner, now),
		Metrics: fakeMetrics{},
		Version: "v1.2.3",
		Now:     now,
	})
	return handler, s, runner
}

func do(t *testing.T, h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	var reader *strings.Reader
	if body == "" {
		reader = strings.NewReader("")
	} else {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %s: %v", rec.Body.String(), err)
	}
	return out
}

func TestRadioConfigReturnsDefaultsBeforeAnythingIsSaved(t *testing.T) {
	h, _, _ := newServer(t)

	rec := do(t, h, http.MethodGet, "/api/settings/radio", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}

	got := decode(t, rec)
	if got["default_service"] != "DCF77" {
		t.Fatalf("got %v, want DCF77", got["default_service"])
	}
	if got["default_duration_minutes"].(float64) != 10 {
		t.Fatalf("got %v, want 10", got["default_duration_minutes"])
	}
	services, ok := got["available_services"].([]any)
	if !ok || len(services) != 5 {
		t.Fatalf("got %v, want five signal standards", got["available_services"])
	}
}

func TestRadioConfigRoundTrips(t *testing.T) {
	h, _, _ := newServer(t)

	rec := do(t, h, http.MethodPost, "/api/settings/radio",
		`{"default_service":"WWVB","default_duration_minutes":25,"default_offset":-60,
		  "default_offset_enabled":true,"default_time_mode":"time_now","default_fixed_time":"08:00"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}

	got := decode(t, do(t, h, http.MethodGet, "/api/settings/radio", ""))
	if got["default_service"] != "WWVB" {
		t.Fatalf("service: got %v", got["default_service"])
	}
	if got["default_offset"].(float64) != -60 {
		t.Fatalf("offset: got %v", got["default_offset"])
	}
	if got["default_offset_enabled"] != true {
		t.Fatalf("offset_enabled: got %v", got["default_offset_enabled"])
	}
}

func TestRadioConfigRejectsUnknownStandard(t *testing.T) {
	h, _, _ := newServer(t)

	rec := do(t, h, http.MethodPost, "/api/settings/radio",
		`{"default_service":"; rm -rf /","default_duration_minutes":10,"default_offset":0}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestScheduleRoundTripsWithFriendlyFields(t *testing.T) {
	h, _, _ := newServer(t)

	rec := do(t, h, http.MethodPost, "/api/crons",
		`{"id":"evening","time":"23:55","frequency":"daily","service":"DCF77","duration":360,"enabled":true}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}

	listRec := do(t, h, http.MethodGet, "/api/crons", "")
	var jobs []map[string]any
	if err := json.Unmarshal(listRec.Body.Bytes(), &jobs); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(jobs) != 1 {
		t.Fatalf("got %d jobs, want 1", len(jobs))
	}
	if jobs[0]["friendly_time"] != "23:55" {
		t.Fatalf("friendly_time: got %v", jobs[0]["friendly_time"])
	}
	if jobs[0]["friendly_freq"] != "daily" {
		t.Fatalf("friendly_freq: got %v", jobs[0]["friendly_freq"])
	}
	if jobs[0]["schedule"] != "55 23 * * *" {
		t.Fatalf("schedule: got %v", jobs[0]["schedule"])
	}
	details := jobs[0]["radio_details"].(map[string]any)
	if details["service"] != "DCF77" || details["duration"] != "360" {
		t.Fatalf("radio_details: got %v", details)
	}
}

func TestScheduleCommandIsBuiltFromCurrentGlobalOffset(t *testing.T) {
	h, _, _ := newServer(t)

	do(t, h, http.MethodPost, "/api/settings/radio",
		`{"default_service":"DCF77","default_duration_minutes":10,"default_offset":45,
		  "default_offset_enabled":true,"default_time_mode":"time_now"}`)

	do(t, h, http.MethodPost, "/api/crons",
		`{"id":"offset-job","time":"01:00","frequency":"daily","service":"DCF77","duration":30,"enabled":true}`)

	listRec := do(t, h, http.MethodGet, "/api/crons", "")
	var jobs []map[string]any
	json.Unmarshal(listRec.Body.Bytes(), &jobs)
	command := jobs[0]["command"].(string)
	if !strings.Contains(command, "-z 45") {
		t.Fatalf("got %q, want the current global offset applied", command)
	}
}

func TestDeletingAnUnknownScheduleIs404(t *testing.T) {
	h, _, _ := newServer(t)

	rec := do(t, h, http.MethodDelete, "/api/crons/ghost", "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("got %d, want 404", rec.Code)
	}
}

func TestStealthTogglesAndPersists(t *testing.T) {
	h, s, _ := newServer(t)

	rec := do(t, h, http.MethodPost, "/api/control/stealth", "")
	if decode(t, rec)["stealth_mode"] != true {
		t.Fatalf("first toggle should enable stealth, got %s", rec.Body)
	}

	value, _, _ := s.Setting("app_config", "stealth_mode")
	if value != "true" {
		t.Fatalf("stored %q, want true", value)
	}

	rec = do(t, h, http.MethodPost, "/api/control/stealth", "")
	if decode(t, rec)["stealth_mode"] != false {
		t.Fatalf("second toggle should disable stealth, got %s", rec.Body)
	}
}

func TestTransmitStartsTheRunnerAndRecordsStatus(t *testing.T) {
	h, _, runner := newServer(t)

	rec := do(t, h, http.MethodPost, "/api/control/transmit", `{"service":"MSF","duration":15}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	if len(runner.started) != 1 {
		t.Fatalf("runner started %d times, want 1", len(runner.started))
	}
	args := strings.Join(runner.started[0], " ")
	if !strings.Contains(args, "-s MSF") || !strings.Contains(args, "-r 15") {
		t.Fatalf("got %q", args)
	}

	status := decode(t, do(t, h, http.MethodGet, "/api/status", ""))
	services := status["services"].(map[string]any)
	if services["txtempus_running"] != true {
		t.Fatalf("status does not report a running transmission: %v", services)
	}
	if services["txtempus_service"] != "MSF" {
		t.Fatalf("got %v, want MSF", services["txtempus_service"])
	}
}

func TestTransmitRejectsUnknownStandard(t *testing.T) {
	h, _, runner := newServer(t)

	rec := do(t, h, http.MethodPost, "/api/control/transmit", `{"service":"EVIL","duration":15}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
	if len(runner.started) != 0 {
		t.Fatal("runner was started for an invalid request")
	}
}

func TestStopClearsRunningStatus(t *testing.T) {
	h, _, runner := newServer(t)

	do(t, h, http.MethodPost, "/api/control/transmit", `{"service":"DCF77","duration":15}`)
	rec := do(t, h, http.MethodPost, "/api/control/stop", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	if runner.stopped != 1 {
		t.Fatalf("runner stopped %d times, want 1", runner.stopped)
	}

	status := decode(t, do(t, h, http.MethodGet, "/api/status", ""))
	services := status["services"].(map[string]any)
	if services["txtempus_running"] != false {
		t.Fatalf("status still reports a transmission: %v", services)
	}
}

func TestStatusReportsVersion(t *testing.T) {
	h, _, _ := newServer(t)

	status := decode(t, do(t, h, http.MethodGet, "/api/status", ""))
	if status["version"] != "v1.2.3" {
		t.Fatalf("got %v, want v1.2.3", status["version"])
	}
}

func TestMetricsAreServed(t *testing.T) {
	h, _, _ := newServer(t)

	rec := do(t, h, http.MethodGet, "/api/system/metrics", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	if decode(t, rec)["temperature"].(float64) != 42.5 {
		t.Fatalf("got %s", rec.Body)
	}
}

func TestTimeTesterEnablesAndDisables(t *testing.T) {
	h, _, runner := newServer(t)

	rec := do(t, h, http.MethodPost, "/api/control/time-tester", `{"enabled":true,"service":"JJY60","duration_hours":2}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	if len(runner.started) != 1 {
		t.Fatalf("runner started %d times, want 1", len(runner.started))
	}
	if !strings.Contains(strings.Join(runner.started[0], " "), "-r 120") {
		t.Fatalf("got %q, want two hours in minutes", runner.started[0])
	}

	got := decode(t, do(t, h, http.MethodGet, "/api/control/time-tester", ""))
	if got["enabled"] != true {
		t.Fatalf("got %v, want enabled", got)
	}

	do(t, h, http.MethodPost, "/api/control/time-tester", `{"enabled":false}`)
	got = decode(t, do(t, h, http.MethodGet, "/api/control/time-tester", ""))
	if got["enabled"] != false {
		t.Fatalf("got %v, want disabled", got)
	}
}

func TestUnknownAPIPathsDoNotFallThroughToTheDashboard(t *testing.T) {
	s, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer s.Close()

	h := api.New(api.Deps{
		Store:   s,
		Runner:  broadcast.New(s, &fakeRunner{}, nil),
		Metrics: fakeMetrics{},
		Static: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte("<!DOCTYPE html>"))
		}),
	})

	rec := do(t, h, http.MethodPost, "/api/system/switch-branch", `{"branch":"experimental"}`)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("got %d, want 404 for a removed endpoint", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "DOCTYPE") {
		t.Fatal("an unknown api path served the dashboard instead of an error")
	}

	rec = do(t, h, http.MethodGet, "/anything/else", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want the dashboard for a non-api route", rec.Code)
	}
}

func TestBranchSwitchingIsGone(t *testing.T) {
	h, _, _ := newServer(t)

	rec := do(t, h, http.MethodPost, "/api/system/switch-branch", `{"branch":"experimental"}`)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("got %d, want 404 for a removed endpoint", rec.Code)
	}
}
