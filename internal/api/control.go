package api

import (
	"net/http"

	"github.com/aleh11/airtime/internal/transmit"
)

type transmitInput struct {
	Standard string `json:"service"`
	Duration int    `json:"duration"`
}

func (s *server) startTransmit(w http.ResponseWriter, r *http.Request) {
	var input transmitInput
	if !readJSON(w, r, &input) {
		return
	}
	if err := transmit.ValidateStandard(input.Standard); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	duration, err := transmit.ValidateDuration(input.Duration)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	config := s.radioConfig()
	request := transmit.Request{
		Standard:        input.Standard,
		DurationMinutes: duration,
		TimeMode:        config.TimeMode,
		Offset:          config.Offset,
		OffsetEnabled:   config.OffsetEnabled,
		FixedTime:       config.FixedTime,
	}

	if err := s.Runner.Start(request); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	s.log.Info("broadcast started", "standard", input.Standard, "duration", duration)
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "started", "service": input.Standard, "duration": duration,
	})
}

func (s *server) stopTransmit(w http.ResponseWriter, r *http.Request) {
	s.Runner.Stop()

	s.log.Info("broadcast stopped")
	writeJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
}

func (s *server) toggleStealth(w http.ResponseWriter, r *http.Request) {
	current, _, err := s.Store.Setting("app_config", "stealth_mode")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	enabled := current != "true"
	if err := s.Store.SetSetting("app_config", "stealth_mode", boolText(enabled)); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"stealth_mode": enabled})
}

type timeTesterInput struct {
	Enabled       bool   `json:"enabled"`
	Standard      string `json:"service"`
	DurationHours int    `json:"duration_hours"`
}

func (s *server) getTimeTester(w http.ResponseWriter, r *http.Request) {
	active, _, _ := s.Store.Setting("app_config", "time_tester_active")
	standard, ok, _ := s.Store.Setting("app_config", "time_tester_service")
	if !ok {
		standard = "DCF77"
	}

	enabled := active == "true"
	// A tester that outlived its process leaves the schedules paused, so clear
	// the flag as soon as we notice the transmitter is not actually running.
	if enabled && !s.Runner.Running() {
		s.log.Warn("time tester was orphaned; clearing")
		s.disableTimeTester()
		enabled = false
	}

	writeJSON(w, http.StatusOK, map[string]any{"enabled": enabled, "service": standard})
}

func (s *server) setTimeTester(w http.ResponseWriter, r *http.Request) {
	var input timeTesterInput
	if !readJSON(w, r, &input) {
		return
	}

	if !input.Enabled {
		s.disableTimeTester()
		schedules, _ := s.Store.Schedules()
		writeJSON(w, http.StatusOK, map[string]any{"enabled": false, "affected_jobs": len(schedules)})
		return
	}

	if err := transmit.ValidateStandard(input.Standard); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if input.DurationHours <= 0 {
		input.DurationHours = 1
	}

	request := transmit.Request{
		Standard:        input.Standard,
		DurationMinutes: input.DurationHours * 60,
		TimeMode:        "fixed_time",
		FixedTime:       "12:00",
	}
	if err := s.Runner.StartTester(request); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	s.Store.SetSetting("app_config", "time_tester_active", "true")
	s.Store.SetSetting("app_config", "time_tester_service", input.Standard)

	schedules, _ := s.Store.Schedules()
	s.log.Info("time tester started", "standard", input.Standard, "hours", input.DurationHours)
	writeJSON(w, http.StatusOK, map[string]any{"enabled": true, "affected_jobs": len(schedules)})
}

func (s *server) disableTimeTester() {
	s.Runner.Stop()
	s.Store.SetSetting("app_config", "time_tester_active", "false")
}

func boolText(value bool) string {
	if value {
		return "true"
	}
	return "false"
}
