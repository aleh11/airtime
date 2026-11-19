package alwayson

import (
	"github.com/aleh11/airtime/internal/broadcast"
	"github.com/aleh11/airtime/internal/store"
	"github.com/aleh11/airtime/internal/transmit"
)

// Stopper silences the transmitter.
type Stopper interface{ Stop() }

// Enabled reports whether the mode is on.
func Enabled(s *store.Store) bool {
	v, _, _ := s.Setting("app_config", "always_on_enabled")
	return v == "true"
}

// Standard is the standard Always On sends: the one chosen when it was
// enabled, else the dashboard's default.
func Standard(s *store.Store) string {
	if v, ok, _ := s.Setting("always_on", "standard"); ok && v != "" {
		return v
	}
	return broadcast.DefaultRequest(s).Standard
}

// Enable turns the mode on. An empty standard keeps the current one. It ends
// an active Time Tester rather than fighting it. The supervisor does the
// rest on its next check, so callers should wake it.
func Enable(s *store.Store, b Stopper, standard string) (string, error) {
	if standard == "" {
		standard = Standard(s)
	}
	if err := transmit.ValidateStandard(standard); err != nil {
		return "", err
	}
	if active, _, _ := s.Setting("app_config", "time_tester_active"); active == "true" {
		b.Stop()
		if err := s.SetSetting("app_config", "time_tester_active", "false"); err != nil {
			return "", err
		}
	}
	if err := s.SetSetting("always_on", "standard", standard); err != nil {
		return "", err
	}
	if err := s.SetSetting("app_config", "always_on_enabled", "true"); err != nil {
		return "", err
	}
	return standard, nil
}

// Disable turns the mode off and silences its broadcast at once, rather than
// leaving it on the air until the supervisor's next check. A broadcast that
// is not the always-on one is left alone. It reports whether the mode was on.
func Disable(s *store.Store, b Stopper) (bool, error) {
	was := Enabled(s)
	if err := s.SetSetting("app_config", "always_on_enabled", "false"); err != nil {
		return was, err
	}
	var details broadcast.Details
	if found, _ := s.Status("services", "txtempus_details", &details); found && details.AlwaysOn {
		b.Stop()
	}
	return was, nil
}
