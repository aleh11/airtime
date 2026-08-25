package update

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const (
	DefaultReleaseAPI = "https://api.github.com/repos/aleh11/airtime/releases/latest"
	// The list endpoint is the only one that returns prereleases; /releases/latest
	// deliberately skips them, which is what keeps beta builds away from everyone
	// who has not asked for them.
	DefaultPrereleaseAPI = "https://api.github.com/repos/aleh11/airtime/releases?per_page=20"
)

type Info struct {
	Available  bool   `json:"updates_available"`
	Current    string `json:"current_version"`
	Latest     string `json:"latest_version"`
	URL        string `json:"release_url"`
	Channel    string `json:"channel"`
	Prerelease bool   `json:"prerelease"`
}

// Checker asks GitHub what the latest release is, and asks the update helper to
// install it. The daemon never installs anything itself: it writes a request
// file that a systemd path unit is watching, so the privileged work happens in
// a separate, hardened unit.
type Checker struct {
	Current       string
	ReleaseAPI    string
	PrereleaseAPI string
	RequestPath   string
	Client        *http.Client
	// Beta reports whether this install has opted into prereleases. Nil means
	// stable only, so a caller that knows nothing about channels keeps the old
	// behaviour.
	Beta func() bool
}

func (c Checker) beta() bool { return c.Beta != nil && c.Beta() }

type release struct {
	TagName    string `json:"tag_name"`
	HTMLURL    string `json:"html_url"`
	Prerelease bool   `json:"prerelease"`
	Draft      bool   `json:"draft"`
}

func (c Checker) Check() (Info, error) {
	channel := "stable"
	if c.beta() {
		channel = "beta"
	}

	latest, err := c.latest()
	if err != nil {
		return Info{}, err
	}

	return Info{
		Available:  latest.TagName != c.Current,
		Current:    c.Current,
		Latest:     latest.TagName,
		URL:        latest.HTMLURL,
		Channel:    channel,
		Prerelease: latest.Prerelease,
	}, nil
}

// latest resolves the release this install should be running. On the beta
// channel that is the newest release of any kind, so a stable release newer
// than the last prerelease still wins.
func (c Checker) latest() (release, error) {
	if !c.beta() {
		endpoint := c.ReleaseAPI
		if endpoint == "" {
			endpoint = DefaultReleaseAPI
		}
		var found release
		if err := c.fetch(endpoint, &found); err != nil {
			return release{}, err
		}
		if found.TagName == "" {
			return release{}, fmt.Errorf("release has no tag")
		}
		return found, nil
	}

	endpoint := c.PrereleaseAPI
	if endpoint == "" {
		endpoint = DefaultPrereleaseAPI
	}
	var all []release
	if err := c.fetch(endpoint, &all); err != nil {
		return release{}, err
	}
	for _, candidate := range all {
		if candidate.Draft || candidate.TagName == "" {
			continue
		}
		return candidate, nil
	}
	return release{}, fmt.Errorf("no published release found")
}

func (c Checker) fetch(endpoint string, into any) error {
	client := c.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}

	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("build release request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("ask GitHub for the latest release: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("release lookup returned %s", resp.Status)
	}
	if err := json.NewDecoder(resp.Body).Decode(into); err != nil {
		return fmt.Errorf("decode release: %w", err)
	}
	return nil
}

func (c Checker) Apply() error {
	if c.RequestPath == "" {
		return fmt.Errorf("no update request path is configured")
	}
	if err := os.MkdirAll(filepath.Dir(c.RequestPath), 0o755); err != nil {
		return fmt.Errorf("create request dir: %w", err)
	}

	// The request names the exact tag to install, so the helper installs what the
	// dashboard offered rather than whatever "latest" means by the time it runs.
	// A failed lookup still writes a request: the helper falls back to the base
	// URL baked in at install time.
	payload := time.Now().UTC().Format(time.RFC3339)
	if info, err := c.Check(); err == nil && info.Latest != "" {
		payload = info.Latest
	}
	if err := os.WriteFile(c.RequestPath, []byte(payload+"\n"), 0o644); err != nil {
		return fmt.Errorf("write update request: %w", err)
	}
	return nil
}
