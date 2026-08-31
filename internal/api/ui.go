package api

import (
	"encoding/json"
	"net/http"
	"slices"
	"strings"
)

// The validation authority for themes; the CSS lives in themes.css.
var Themes = []string{
	"airtime-dark",
	"airtime-light",
	"tokyo-night",
	"dracula",
	"nord",
	"gruvbox-dark",
	"one-dark",
	"catppuccin-mocha",
	"solarized-light",
}

const (
	defaultTheme = "airtime-dark"

	// The layout is stored opaquely, so it needs its own ceiling — the daemon
	// runs as root and must not accept an unbounded string from the dashboard.
	maxLayoutBytes = 16 * 1024

	maxHiddenWidgets = 32
)

// UIConfig is how the dashboard remembers the way it has been set up. It lives
// in the appliance rather than the browser so the look follows the hardware.
type UIConfig struct {
	Theme         string   `json:"theme"`
	Layout        string   `json:"layout"`
	HiddenWidgets []string `json:"hidden_widgets"`
}

func (s *server) uiConfig() UIConfig {
	config := UIConfig{Theme: defaultTheme, HiddenWidgets: []string{}}

	if value, ok, _ := s.Store.Setting("ui_config", "theme"); ok && slices.Contains(Themes, value) {
		config.Theme = value
	}
	if value, ok, _ := s.Store.Setting("ui_config", "layout"); ok {
		config.Layout = value
	}
	if value, ok, _ := s.Store.Setting("ui_config", "hidden_widgets"); ok && value != "" {
		config.HiddenWidgets = strings.Split(value, ",")
	}

	return config
}

func (s *server) getUIConfig(w http.ResponseWriter, r *http.Request) {
	config := s.uiConfig()

	writeJSON(w, http.StatusOK, map[string]any{
		"theme":            config.Theme,
		"layout":           config.Layout,
		"hidden_widgets":   config.HiddenWidgets,
		"available_themes": Themes,
	})
}

func (s *server) setUIConfig(w http.ResponseWriter, r *http.Request) {
	var input UIConfig
	if !readJSON(w, r, &input) {
		return
	}

	if input.Theme == "" {
		input.Theme = defaultTheme
	}
	if !slices.Contains(Themes, input.Theme) {
		writeError(w, http.StatusBadRequest, "unknown theme "+input.Theme)
		return
	}

	if len(input.Layout) > maxLayoutBytes {
		writeError(w, http.StatusBadRequest, "layout is too large")
		return
	}
	if input.Layout != "" && !json.Valid([]byte(input.Layout)) {
		writeError(w, http.StatusBadRequest, "layout must be JSON")
		return
	}

	if len(input.HiddenWidgets) > maxHiddenWidgets {
		writeError(w, http.StatusBadRequest, "too many hidden widgets")
		return
	}
	for _, widget := range input.HiddenWidgets {
		if widget == "" || strings.ContainsAny(widget, ",") {
			writeError(w, http.StatusBadRequest, "invalid widget id")
			return
		}
	}

	settings := map[string]string{
		"theme":          input.Theme,
		"layout":         input.Layout,
		"hidden_widgets": strings.Join(input.HiddenWidgets, ","),
	}
	for key, value := range settings {
		if err := s.Store.SetSetting("ui_config", key, value); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	s.log.Info("ui config updated", "theme", input.Theme, "hidden_widgets", len(input.HiddenWidgets))

	writeJSON(w, http.StatusOK, map[string]any{"status": "updated"})
}
