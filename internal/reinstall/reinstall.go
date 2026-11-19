// Package reinstall keeps the installed txtempus in step with the release.
//
// Each release ships its own txtempus and the update helper installs it. Pis
// installed before that still run the old helper, which only swaps the AirTime
// binary, and a transmitter compiled from upstream. When the daemon finds a
// txtempus that is not the one it was built with, it asks systemd to run this
// release's installer once, outside the daemon's sandbox. The installer puts
// the release's txtempus and the current update helper in place, then restarts
// AirTime.
package reinstall

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// Outcome says what Check decided.
type Outcome string

const (
	// UpToDate: the installed txtempus is the one this release ships.
	UpToDate Outcome = "up to date"
	// Skipped: this build cannot repair itself (a development build, or one
	// built without a txtempus checksum).
	Skipped Outcome = "skipped"
	// Throttled: a reinstall for this release was started recently.
	Throttled Outcome = "throttled"
	// Started: the installer was handed to systemd.
	Started Outcome = "started"
)

// UnitName is the transient systemd unit the installer runs in.
const UnitName = "airtime-reinstall"

// releaseTag accepts published tags only; build.sh marks local builds -dev.
var releaseTag = regexp.MustCompile(`^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$`)

type Checker struct {
	// Version is this build's release tag, such as v2.1.0 or v2.1.0-beta.12.
	Version string
	// ExpectedSHA256 is the checksum of the txtempus this release ships.
	ExpectedSHA256 string
	// BinaryPath is the installed txtempus.
	BinaryPath string
	// StatePath records the last attempt, so a failing installer is not
	// retried on every restart.
	StatePath string
	// Repository is the GitHub owner/name releases are published under.
	Repository string
	// RetryAfter is how long to wait before trying the same release again.
	RetryAfter time.Duration
	Now        func() time.Time
	// Start launches the command without waiting for it.
	Start func(name string, args ...string) error
}

type attempt struct {
	Version     string    `json:"version"`
	AttemptedAt time.Time `json:"attempted_at"`
}

// Check compares the installed txtempus with this release's and, when they
// differ, starts the release's installer.
func (c Checker) Check() (Outcome, error) {
	if c.ExpectedSHA256 == "" || !releaseTag.MatchString(c.Version) || isDev(c.Version) {
		return Skipped, nil
	}

	installed, err := fileSHA256(c.BinaryPath)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return Skipped, fmt.Errorf("read %s: %w", c.BinaryPath, err)
	}
	if installed == c.ExpectedSHA256 {
		return UpToDate, nil
	}

	now := c.now()
	if last, ok := c.lastAttempt(); ok && last.Version == c.Version &&
		now.Sub(last.AttemptedAt) < c.RetryAfter {
		return Throttled, nil
	}

	// Recorded before starting: if the installer kills this daemon part way
	// through, the next start must not launch a second one.
	if err := c.record(attempt{Version: c.Version, AttemptedAt: now}); err != nil {
		return Skipped, fmt.Errorf("record reinstall attempt: %w", err)
	}

	name, args := c.Command()
	if err := c.Start(name, args...); err != nil {
		return Skipped, fmt.Errorf("start reinstall: %w", err)
	}
	return Started, nil
}

// Command is the systemd-run invocation that reinstalls this release.
func (c Checker) Command() (string, []string) {
	base := fmt.Sprintf("https://github.com/%s/releases/download/%s", c.Repository, c.Version)
	script := "set -o pipefail; curl --fail --silent --show-error --location --retry 3 " +
		"--proto '=https' --tlsv1.2 '" + base + "/install.sh' | bash"
	return "systemd-run", []string{
		"--unit=" + UnitName,
		"--collect",
		"--quiet",
		"--description=Reinstall AirTime " + c.Version + " to update txtempus",
		// The installer downloads from this release, not from releases/latest.
		"--setenv=AIRTIME_RELEASE_BASE_URL=" + base,
		"/bin/bash", "-c", script,
	}
}

func (c Checker) now() time.Time {
	if c.Now != nil {
		return c.Now()
	}
	return time.Now()
}

func (c Checker) lastAttempt() (attempt, bool) {
	data, err := os.ReadFile(c.StatePath)
	if err != nil {
		return attempt{}, false
	}
	var last attempt
	if json.Unmarshal(data, &last) != nil {
		return attempt{}, false
	}
	return last, true
}

func (c Checker) record(a attempt) error {
	data, err := json.Marshal(a)
	if err != nil {
		return err
	}
	tmp := c.StatePath + ".tmp"
	if err := os.MkdirAll(filepath.Dir(c.StatePath), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, c.StatePath)
}

func isDev(version string) bool {
	return strings.HasSuffix(version, "-dev")
}

func fileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
