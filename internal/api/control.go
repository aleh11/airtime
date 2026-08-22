package api

import (
	"net/http"
	"time"

	"github.com/aleh11/airtime/internal/transmit"
)

// broadcast is what the daemon remembers about the transmission it started.
type broadcast struct {
	Standard  string `json:"service"`
	Duration  int    `json:"duration"`
	StartedAt string `json:"started_at"`
	Offset    *int   `json:"offset"`
	FixedTime string `json:"fixed_time"`
	IsTester  bool   `json:"is_tester"`
}

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

	if err := s.Runner.Start(transmit.Command(request, s.Now())); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.recordBroadcast(request, false)

	s.log.Info("broadcast started", "standard", input.Standard, "duration", duration)
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "started", "service": input.Standard, "duration": duration,
	})
}

func (s *server) stopTransmit(w http.ResponseWriter, r *http.Request) {
	s.Runner.Stop()
	s.clearBroadcast()

	s.log.Info("broadcast stopped")
	writeJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
}

func (s *server) recordBroadcast(request transmit.Request, isTester bool) {
	details := broadcast{
		Standard:  request.Standard,
		Duration:  request.DurationMinutes,
		StartedAt: s.Now().Format(time.RFC3339),
		IsTester:  isTester,
	}
	if (request.TimeMode == "time_now_with_offset" || request.OffsetEnabled) && request.Offset != 0 {
		offset := request.Offset
		details.Offset = &offset
	}
	if request.TimeMode == "fixed_time" {
		details.FixedTime = request.FixedTime
	}

	if err := s.Store.SetStatus("services", "txtempus_running", true); err != nil {
		s.log.Error("record broadcast", "error", err)
	}
	if err := s.Store.SetStatus("services", "txtempus_details", details); err != nil {
		s.log.Error("record broadcast", "error", err)
	}
}

func (s *server) clearBroadcast() {
	if err := s.Store.SetStatus("services", "txtempus_running", false); err != nil {
		s.log.Error("clear broadcast", "error", err)
	}
	if err := s.Store.SetStatus("services", "txtempus_details", broadcast{}); err != nil {
		s.log.Error("clear broadcast", "error", err)
	}
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
	if err := s.Runner.Start(transmit.Command(request, s.Now())); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	s.recordBroadcast(request, true)
	s.Store.SetSetting("app_config", "time_tester_active", "true")
	s.Store.SetSetting("app_config", "time_tester_service", input.Standard)

	schedules, _ := s.Store.Schedules()
	s.log.Info("time tester started", "standard", input.Standard, "hours", input.DurationHours)
	writeJSON(w, http.StatusOK, map[string]any{"enabled": true, "affected_jobs": len(schedules)})
}

func (s *server) disableTimeTester() {
	s.Runner.Stop()
	s.clearBroadcast()
	s.Store.SetSetting("app_config", "time_tester_active", "false")
}

func boolText(value bool) string {
	if value {
		return "true"
	}
	return "false"
}
