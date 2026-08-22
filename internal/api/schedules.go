package api

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/aleh11/airtime/internal/scheduler"
	"github.com/aleh11/airtime/internal/store"
	"github.com/aleh11/airtime/internal/transmit"
)

type scheduleInput struct {
	ID        string `json:"id"`
	Time      string `json:"time"`
	Frequency string `json:"frequency"`
	Standard  string `json:"service"`
	Duration  int    `json:"duration"`
	Enabled   bool   `json:"enabled"`
}

var (
	standardPattern = regexp.MustCompile(`-s\s+(\w+)`)
	durationPattern = regexp.MustCompile(`-r\s+(\d+)`)
	offsetPattern   = regexp.MustCompile(`-z\s+(-?\d+)`)
)

func (s *server) listSchedules(w http.ResponseWriter, r *http.Request) {
	schedules, err := s.Store.Schedules()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	out := make([]map[string]any, 0, len(schedules))
	for _, sc := range schedules {
		clock, frequency := scheduler.FriendlyFrom(sc.Spec)
		out = append(out, map[string]any{
			"id":            sc.ID,
			"command":       sc.Command,
			"schedule":      sc.Spec,
			"enabled":       sc.Enabled,
			"friendly_time": clock,
			"friendly_freq": frequency,
			"radio_details": describeCommand(sc.Command),
		})
	}

	writeJSON(w, http.StatusOK, out)
}

func describeCommand(command string) map[string]any {
	details := map[string]any{
		"is_txtempus": strings.Contains(command, "txtempus"),
		"service":     "DCF77",
		"duration":    "10",
		"offset":      "0",
	}
	if match := standardPattern.FindStringSubmatch(command); match != nil {
		details["service"] = match[1]
	}
	if match := durationPattern.FindStringSubmatch(command); match != nil {
		details["duration"] = match[1]
	}
	if match := offsetPattern.FindStringSubmatch(command); match != nil {
		details["offset"] = match[1]
	}
	return details
}

func (s *server) saveSchedule(w http.ResponseWriter, r *http.Request) {
	var input scheduleInput
	if !readJSON(w, r, &input) {
		return
	}
	if input.ID == "" {
		writeError(w, http.StatusBadRequest, "schedule id is required")
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
	spec, err := scheduler.SpecFrom(input.Time, input.Frequency)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// The command is always rebuilt from the stored global settings rather than
	// anything the client sent, so a schedule cannot carry a stale offset.
	sc := store.Schedule{
		ID:      input.ID,
		Command: s.commandFor(input.Standard, duration),
		Spec:    spec,
		Enabled: input.Enabled,
	}
	if err := s.Store.SaveSchedule(sc); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	s.log.Info("schedule saved", "id", sc.ID, "spec", sc.Spec, "enabled", sc.Enabled)
	writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

func (s *server) deleteSchedule(w http.ResponseWriter, r *http.Request) {
	existed, err := s.Store.DeleteSchedule(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !existed {
		writeError(w, http.StatusNotFound, "Job not found")
		return
	}

	s.log.Info("schedule deleted", "id", r.PathValue("id"))
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// commandFor renders the txtempus invocation stored against a schedule.
func (s *server) commandFor(standard string, duration int) string {
	config := s.radioConfig()
	return strings.Join(transmit.Command(transmit.Request{
		Standard:        standard,
		DurationMinutes: duration,
		TimeMode:        config.TimeMode,
		Offset:          config.Offset,
		OffsetEnabled:   config.OffsetEnabled,
		FixedTime:       config.FixedTime,
	}, s.Now()), " ")
}

// rebuildScheduleCommands re-renders every stored command after the global
// encoding settings change.
func (s *server) rebuildScheduleCommands() (int, error) {
	schedules, err := s.Store.Schedules()
	if err != nil {
		return 0, err
	}

	rebuilt := 0
	for _, sc := range schedules {
		details := describeCommand(sc.Command)
		if !details["is_txtempus"].(bool) {
			continue
		}

		standard, _ := details["service"].(string)
		durationText, _ := details["duration"].(string)
		duration := 10
		if parsed := durationPattern.FindStringSubmatch("-r " + durationText); parsed != nil {
			duration = atoiOr(parsed[1], 10)
		}

		updated := s.commandFor(standard, duration)
		if updated == sc.Command {
			continue
		}
		sc.Command = updated
		if err := s.Store.SaveSchedule(sc); err != nil {
			return rebuilt, err
		}
		rebuilt++
	}

	return rebuilt, nil
}
