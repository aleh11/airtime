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
	// Only this endpoint returns prereleases; /releases/latest excludes them by design.
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

// The daemon never installs anything itself; it writes a request a path unit watches.
type Checker struct {
	Current       string
	ReleaseAPI    string
	PrereleaseAPI string
	RequestPath   string
	Client        *http.Client
	// Nil means stable only.
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
		// Newer, not merely different: a beta install is ahead of stable.
		Available:  newer(latest.TagName, c.Current),
		Current:    c.Current,
		Latest:     latest.TagName,
		URL:        latest.HTMLURL,
		Channel:    channel,
		Prerelease: latest.Prerelease,
	}, nil
}

// On beta this is the newest release of any kind, so a newer stable still wins.
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
	var best release
	for _, candidate := range all {
		if candidate.Draft || candidate.TagName == "" {
			continue
		}
		if best.TagName == "" || newer(candidate.TagName, best.TagName) {
			best = candidate
		}
	}
	if best.TagName == "" {
		return release{}, fmt.Errorf("no published release found")
	}
	return best, nil
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

	// Naming the tag installs what the dashboard offered, not whatever latest becomes.
	payload := time.Now().UTC().Format(time.RFC3339)
	if info, err := c.Check(); err == nil && info.Latest != "" {
		payload = info.Latest
	}
	if err := os.WriteFile(c.RequestPath, []byte(payload+"\n"), 0o644); err != nil {
		return fmt.Errorf("write update request: %w", err)
	}
	return nil
}
