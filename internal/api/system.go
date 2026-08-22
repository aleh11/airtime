package api

import (
	"net/http"
	"time"

	"github.com/aleh11/airtime/internal/broadcast"
)

func (s *server) getStatus(w http.ResponseWriter, r *http.Request) {
	var running bool
	s.Store.Status("services", "txtempus_running", &running)

	var details broadcast.Details
	s.Store.Status("services", "txtempus_details", &details)

	remaining := 0
	if running && details.StartedAt != "" && details.Duration > 0 {
		if startedAt, err := time.Parse(time.RFC3339, details.StartedAt); err == nil {
			endsAt := startedAt.Add(time.Duration(details.Duration) * time.Minute)
			if left := int(endsAt.Sub(s.Now()).Seconds()); left > 0 {
				remaining = left
			}
		}
	}

	var ntp struct {
		Synced        bool    `json:"synced"`
		Score         float64 `json:"score"`
		LastRxSeconds float64 `json:"last_rx_seconds"`
		Server        string  `json:"server"`
	}
	s.Store.Status("ntp_status", "synced", &ntp.Synced)
	s.Store.Status("ntp_status", "score", &ntp.Score)
	s.Store.Status("ntp_status", "last_rx_seconds", &ntp.LastRxSeconds)
	s.Store.Status("ntp_status", "server", &ntp.Server)

	var internet struct {
		Connected bool    `json:"connected"`
		Score     float64 `json:"score"`
		PingMS    float64 `json:"ping_ms"`
	}
	s.Store.Status("internet_status", "connected", &internet.Connected)
	s.Store.Status("internet_status", "score", &internet.Score)
	s.Store.Status("internet_status", "ping_ms", &internet.PingMS)

	stealth, _, _ := s.Store.Setting("app_config", "stealth_mode")

	var offset any
	if details.Offset != nil {
		offset = *details.Offset
	}
	var fixedTime any
	if details.FixedTime != "" {
		fixedTime = details.FixedTime
	}
	var standard any
	if details.Standard != "" {
		standard = details.Standard
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"system_time": s.Now().Format(time.RFC3339),
		"version":     s.Version,
		"services": map[string]any{
			"txtempus_running":           running,
			"txtempus_service":           standard,
			"txtempus_duration":          details.Duration,
			"txtempus_started_at":        details.StartedAt,
			"txtempus_offset":            offset,
			"txtempus_fixed_time":        fixedTime,
			"txtempus_remaining_seconds": remaining,
		},
		"ntp_status":      ntp,
		"internet_status": internet,
		"app_config":      map[string]any{"stealth_mode": stealth == "true"},
	})
}

func (s *server) getMetrics(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.Metrics.Snapshot())
}

func (s *server) checkUpdates(w http.ResponseWriter, r *http.Request) {
	if s.Updater == nil {
		writeError(w, http.StatusServiceUnavailable, "updates are not configured")
		return
	}

	info, err := s.Updater.Check()
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *server) applyUpdate(w http.ResponseWriter, r *http.Request) {
	if s.Updater == nil {
		writeError(w, http.StatusServiceUnavailable, "updates are not configured")
		return
	}

	if err := s.Updater.Apply(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	s.log.Info("update requested")
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "updating",
		"message": "Update requested. The service will restart when the new release is installed.",
	})
}

func (s *server) restartService(w http.ResponseWriter, r *http.Request) {
	if s.RestartService == nil {
		writeError(w, http.StatusServiceUnavailable, "restart is not configured")
		return
	}
	if err := s.RestartService(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "restarting"})
}

func (s *server) rebootHost(w http.ResponseWriter, r *http.Request) {
	if s.RebootHost == nil {
		writeError(w, http.StatusServiceUnavailable, "reboot is not configured")
		return
	}
	if err := s.RebootHost(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "rebooting"})
}
