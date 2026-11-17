package api

import (
	"net/http"
	"strconv"

	"github.com/aleh11/airtime/internal/alwayson"
)

const alwaysOnConflict = "Always On is enabled; turn it off first"

// alwaysOnStatus mirrors alwayson.Status as the supervisor publishes it. It is
// read from the store so the API never touches the supervisor's goroutine.
type alwaysOnStatus struct {
	State     string `json:"state"`
	Since     string `json:"since"`
	LastError string `json:"last_error"`
	Restarts  int    `json:"restarts"`
	RetryAt   string `json:"retry_at"`
}

type alwaysOnInput struct {
	Enabled  bool   `json:"enabled"`
	Standard string `json:"service"`
}

func (s *server) alwaysOnEnabled() bool { return alwayson.Enabled(s.Store) }

func (s *server) alwaysOnState() alwaysOnStatus {
	status := alwaysOnStatus{State: "off"}
	s.Store.Status("always_on", "status", &status)
	if !s.alwaysOnEnabled() {
		// The supervisor catches up within a check; never report a mode
		// that is off as anything else.
		status = alwaysOnStatus{State: "off", Restarts: status.Restarts}
	}
	return status
}

func (s *server) alwaysOnStandard() string { return alwayson.Standard(s.Store) }

func (s *server) alwaysOnResponse() map[string]any {
	requireSync, _, _ := s.Store.Setting("always_on", "require_time_sync")
	cutoff := 85
	if v, ok, _ := s.Store.Setting("always_on", "thermal_cutoff_c"); ok {
		if n, err := strconv.Atoi(v); err == nil {
			cutoff = n
		}
	}
	status := s.alwaysOnState()
	return map[string]any{
		"enabled":           s.alwaysOnEnabled(),
		"standard":          s.alwaysOnStandard(),
		"state":             status.State,
		"since":             status.Since,
		"last_error":        status.LastError,
		"retry_at":          status.RetryAt,
		"restarts":          status.Restarts,
		"require_time_sync": requireSync != "false",
		"thermal_cutoff_c":  cutoff,
	}
}

func (s *server) getAlwaysOn(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.alwaysOnResponse())
}

func (s *server) setAlwaysOn(w http.ResponseWriter, r *http.Request) {
	var input alwaysOnInput
	if !readJSON(w, r, &input) {
		return
	}

	if !input.Enabled {
		s.disableAlwaysOn()
		writeJSON(w, http.StatusOK, s.alwaysOnResponse())
		return
	}

	standard, err := alwayson.Enable(s.Store, s.Runner, input.Standard)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.wakeAlwaysOn()

	s.log.Info("always on enabled", "standard", standard)
	writeJSON(w, http.StatusOK, s.alwaysOnResponse())
}

// disableAlwaysOn turns the mode off and silences its broadcast at once,
// rather than leaving it on the air until the supervisor's next check.
func (s *server) disableAlwaysOn() {
	was, err := alwayson.Disable(s.Store, s.Runner)
	if err != nil {
		s.log.Error("disable always on", "error", err)
	}
	s.wakeAlwaysOn()
	if was {
		s.log.Info("always on disabled")
	}
}

func (s *server) wakeAlwaysOn() {
	if s.WakeAlwaysOn != nil {
		s.WakeAlwaysOn()
	}
}
