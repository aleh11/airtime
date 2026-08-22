package update

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const DefaultReleaseAPI = "https://api.github.com/repos/aleh11/airtime/releases/latest"

type Info struct {
	Available bool   `json:"updates_available"`
	Current   string `json:"current_version"`
	Latest    string `json:"latest_version"`
	URL       string `json:"release_url"`
}

// Checker asks GitHub what the latest release is, and asks the update helper to
// install it. The daemon never installs anything itself: it writes a request
// file that a systemd path unit is watching, so the privileged work happens in
// a separate, hardened unit.
type Checker struct {
	Current     string
	ReleaseAPI  string
	RequestPath string
	Client      *http.Client
}

func (c Checker) Check() (Info, error) {
	endpoint := c.ReleaseAPI
	if endpoint == "" {
		endpoint = DefaultReleaseAPI
	}
	client := c.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}

	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return Info{}, fmt.Errorf("build release request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := client.Do(req)
	if err != nil {
		return Info{}, fmt.Errorf("ask GitHub for the latest release: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return Info{}, fmt.Errorf("release lookup returned %s", resp.Status)
	}

	var payload struct {
		TagName string `json:"tag_name"`
		HTMLURL string `json:"html_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return Info{}, fmt.Errorf("decode release: %w", err)
	}
	if payload.TagName == "" {
		return Info{}, fmt.Errorf("release has no tag")
	}

	return Info{
		Available: payload.TagName != c.Current,
		Current:   c.Current,
		Latest:    payload.TagName,
		URL:       payload.HTMLURL,
	}, nil
}

func (c Checker) Apply() error {
	if c.RequestPath == "" {
		return fmt.Errorf("no update request path is configured")
	}
	if err := os.MkdirAll(filepath.Dir(c.RequestPath), 0o755); err != nil {
		return fmt.Errorf("create request dir: %w", err)
	}

	stamp := time.Now().UTC().Format(time.RFC3339)
	if err := os.WriteFile(c.RequestPath, []byte(stamp+"\n"), 0o644); err != nil {
		return fmt.Errorf("write update request: %w", err)
	}
	return nil
}
