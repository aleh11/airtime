package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/aleh11/airtime/internal/metrics"
	"github.com/aleh11/airtime/internal/store"
	"github.com/aleh11/airtime/internal/transmit"
	"github.com/aleh11/airtime/internal/update"
)

// Broadcaster starts and stops transmissions, recording what is on air.
type Broadcaster interface {
	Start(req transmit.Request) error
	StartTester(req transmit.Request) error
	Stop()
	Running() bool
}

type MetricsSource interface {
	Snapshot() metrics.Snapshot
}

// Updater reports and applies releases. A nil Updater disables the endpoints.
type Updater interface {
	Check() (update.Info, error)
	Apply() error
}

type Deps struct {
	Store   *store.Store
	Runner  Broadcaster
	Metrics MetricsSource
	Updater Updater
	Version string
	Now     func() time.Time
	Static  http.Handler

	// RestartService and RebootHost are injected so tests never reboot anything.
	RestartService func() error
	RebootHost     func() error
}

type server struct {
	Deps
	log *slog.Logger
}

func New(deps Deps) http.Handler {
	if deps.Now == nil {
		deps.Now = time.Now
	}
	s := &server{Deps: deps, log: slog.Default()}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/status", s.getStatus)
	mux.HandleFunc("GET /api/crons", s.listSchedules)
	mux.HandleFunc("POST /api/crons", s.saveSchedule)
	mux.HandleFunc("DELETE /api/crons/{id}", s.deleteSchedule)
	mux.HandleFunc("GET /api/settings/radio", s.getRadioConfig)
	mux.HandleFunc("POST /api/settings/radio", s.setRadioConfig)
	mux.HandleFunc("GET /api/settings/ui", s.getUIConfig)
	mux.HandleFunc("POST /api/settings/ui", s.setUIConfig)
	mux.HandleFunc("POST /api/control/stealth", s.toggleStealth)
	mux.HandleFunc("POST /api/control/transmit", s.startTransmit)
	mux.HandleFunc("POST /api/control/stop", s.stopTransmit)
	mux.HandleFunc("GET /api/control/time-tester", s.getTimeTester)
	mux.HandleFunc("POST /api/control/time-tester", s.setTimeTester)
	mux.HandleFunc("POST /api/control/restart", s.restartService)
	mux.HandleFunc("POST /api/control/restart-pi", s.rebootHost)
	mux.HandleFunc("GET /api/system/metrics", s.getMetrics)
	mux.HandleFunc("GET /api/system/release-channel", s.getReleaseChannel)
	mux.HandleFunc("POST /api/system/release-channel", s.setReleaseChannel)
	mux.HandleFunc("GET /api/system/check-updates", s.checkUpdates)
	mux.HandleFunc("POST /api/system/apply-update", s.applyUpdate)

	// Unknown API paths must 404 rather than fall through to the dashboard's
	// index.html, which would turn every typo into a misleading 200.
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "unknown endpoint")
	})

	if deps.Static != nil {
		mux.Handle("/", deps.Static)
	}

	return securityHeaders(mux)
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Frame-Options", "SAMEORIGIN")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		slog.Error("write response", "error", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"detail": message})
}

func readJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	if err := json.NewDecoder(r.Body).Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return false
	}
	return true
}
