package api

import (
	"net/http"
	"strconv"

	"github.com/aleh11/airtime/internal/transmit"
)

// RadioConfig is the dashboard's view of how a broadcast should be encoded.
type RadioConfig struct {
	Standard        string `json:"default_service"`
	DurationMinutes int    `json:"default_duration_minutes"`
	Offset          int    `json:"default_offset"`
	OffsetEnabled   bool   `json:"default_offset_enabled"`
	TimeMode        string `json:"default_time_mode"`
	FixedTime       string `json:"default_fixed_time"`
}

var defaultRadioConfig = RadioConfig{
	Standard:        "DCF77",
	DurationMinutes: 10,
	Offset:          0,
	OffsetEnabled:   false,
	TimeMode:        "time_now",
	FixedTime:       "12:00",
}

func (s *server) radioConfig() RadioConfig {
	config := defaultRadioConfig

	if value, ok, _ := s.Store.Setting("radio_config", "default_service"); ok {
		config.Standard = value
	}
	if value, ok, _ := s.Store.Setting("radio_config", "default_duration_minutes"); ok {
		if parsed, err := strconv.Atoi(value); err == nil {
			config.DurationMinutes = parsed
		}
	}
	if value, ok, _ := s.Store.Setting("radio_config", "default_offset"); ok {
		if parsed, err := strconv.Atoi(value); err == nil {
			config.Offset = parsed
		}
	}
	if value, ok, _ := s.Store.Setting("radio_config", "default_offset_enabled"); ok {
		config.OffsetEnabled = value == "true"
	}
	if value, ok, _ := s.Store.Setting("radio_config", "default_time_mode"); ok {
		config.TimeMode = value
	}
	if value, ok, _ := s.Store.Setting("radio_config", "default_fixed_time"); ok {
		config.FixedTime = value
	}

	return config
}

func (s *server) getRadioConfig(w http.ResponseWriter, r *http.Request) {
	config := s.radioConfig()

	writeJSON(w, http.StatusOK, map[string]any{
		"default_service":          config.Standard,
		"default_duration_minutes": config.DurationMinutes,
		"default_offset":           config.Offset,
		"default_offset_enabled":   config.OffsetEnabled,
		"default_time_mode":        config.TimeMode,
		"default_fixed_time":       config.FixedTime,
		"available_services":       transmit.Standards,
	})
}

func (s *server) setRadioConfig(w http.ResponseWriter, r *http.Request) {
	var input RadioConfig
	if !readJSON(w, r, &input) {
		return
	}

	if err := transmit.ValidateStandard(input.Standard); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	duration, err := transmit.ValidateDuration(input.DurationMinutes)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if input.Offset < -1440 || input.Offset > 1440 {
		writeError(w, http.StatusBadRequest, "offset must be within a day")
		return
	}
	if input.TimeMode == "" {
		input.TimeMode = defaultRadioConfig.TimeMode
	}

	settings := map[string]string{
		"default_service":          input.Standard,
		"default_duration_minutes": strconv.Itoa(duration),
		"default_offset":           strconv.Itoa(input.Offset),
		"default_offset_enabled":   strconv.FormatBool(input.OffsetEnabled),
		"default_time_mode":        input.TimeMode,
		"default_fixed_time":       input.FixedTime,
	}
	for key, value := range settings {
		if err := s.Store.SetSetting("radio_config", key, value); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	rebuilt, err := s.rebuildScheduleCommands()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	s.log.Info("radio config updated",
		"standard", input.Standard, "duration", duration,
		"offset", input.Offset, "schedules_rebuilt", rebuilt)

	writeJSON(w, http.StatusOK, map[string]any{
		"status":            "updated",
		"cron_jobs_updated": rebuilt,
	})
}
