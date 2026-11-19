package reinstall_test

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/aleh11/airtime/internal/reinstall"
)

type harness struct {
	checker reinstall.Checker
	now     time.Time
	started [][]string
}

func newHarness(t *testing.T, installed []byte) *harness {
	t.Helper()
	dir := t.TempDir()
	binary := filepath.Join(dir, "txtempus")
	if installed != nil {
		if err := os.WriteFile(binary, installed, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	h := &harness{now: time.Date(2026, 11, 19, 12, 0, 0, 0, time.UTC)}
	h.checker = reinstall.Checker{
		Version:        "v2.1.0-beta.7",
		ExpectedSHA256: sum([]byte("release txtempus")),
		BinaryPath:     binary,
		StatePath:      filepath.Join(dir, "state", "reinstall.json"),
		Repository:     "aleh11/airtime",
		RetryAfter:     6 * time.Hour,
		Now:            func() time.Time { return h.now },
		Start: func(name string, args ...string) error {
			h.started = append(h.started, append([]string{name}, args...))
			return nil
		},
	}
	return h
}

func sum(data []byte) string {
	s := sha256.Sum256(data)
	return hex.EncodeToString(s[:])
}

func (h *harness) check(t *testing.T) reinstall.Outcome {
	t.Helper()
	outcome, err := h.checker.Check()
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	return outcome
}

func TestMatchingTxtempusIsLeftAlone(t *testing.T) {
	h := newHarness(t, []byte("release txtempus"))
	if got := h.check(t); got != reinstall.UpToDate {
		t.Fatalf("got %q, want %q", got, reinstall.UpToDate)
	}
	if len(h.started) != 0 {
		t.Fatalf("started %v, want nothing", h.started)
	}
}

func TestDifferentTxtempusStartsThisReleasesInstaller(t *testing.T) {
	h := newHarness(t, []byte("txtempus built from upstream"))
	if got := h.check(t); got != reinstall.Started {
		t.Fatalf("got %q, want %q", got, reinstall.Started)
	}
	if len(h.started) != 1 {
		t.Fatalf("started %d commands, want 1", len(h.started))
	}
	cmd := h.started[0]
	if cmd[0] != "systemd-run" || !slices.Contains(cmd, "--unit="+reinstall.UnitName) {
		t.Fatalf("command %q, want a systemd-run transient unit", cmd)
	}
	base := "https://github.com/aleh11/airtime/releases/download/v2.1.0-beta.7"
	if !slices.Contains(cmd, "--setenv=AIRTIME_RELEASE_BASE_URL="+base) {
		t.Fatalf("command %q does not pin the installer's downloads to this release", cmd)
	}
	script := cmd[len(cmd)-1]
	if !strings.Contains(script, "'"+base+"/install.sh' | bash") || !strings.Contains(script, "pipefail") {
		t.Fatalf("script %q does not run this release's installer", script)
	}
}

func TestMissingTxtempusStartsTheInstaller(t *testing.T) {
	h := newHarness(t, nil)
	if got := h.check(t); got != reinstall.Started {
		t.Fatalf("got %q, want %q", got, reinstall.Started)
	}
}

func TestAFailedReinstallIsNotRetriedOnEveryRestart(t *testing.T) {
	h := newHarness(t, []byte("old"))
	h.check(t)

	h.now = h.now.Add(5 * time.Hour)
	if got := h.check(t); got != reinstall.Throttled {
		t.Fatalf("got %q, want %q", got, reinstall.Throttled)
	}

	h.now = h.now.Add(2 * time.Hour)
	if got := h.check(t); got != reinstall.Started {
		t.Fatalf("after the retry window got %q, want %q", got, reinstall.Started)
	}
	if len(h.started) != 2 {
		t.Fatalf("started %d times, want 2", len(h.started))
	}
}

func TestANewReleaseIsNotHeldBackByTheLastOnesAttempt(t *testing.T) {
	h := newHarness(t, []byte("old"))
	h.check(t)

	h.checker.Version = "v2.1.0-beta.8"
	if got := h.check(t); got != reinstall.Started {
		t.Fatalf("got %q, want %q", got, reinstall.Started)
	}
}

func TestBuildsThatCannotRepairThemselvesAreSkipped(t *testing.T) {
	for name, mutate := range map[string]func(*reinstall.Checker){
		"development build": func(c *reinstall.Checker) { c.Version = "dev" },
		"local build":       func(c *reinstall.Checker) { c.Version = "v2.1.0-dev" },
		"no checksum":       func(c *reinstall.Checker) { c.ExpectedSHA256 = "" },
		"odd version":       func(c *reinstall.Checker) { c.Version = "v2.1.0'; rm -rf /" },
	} {
		t.Run(name, func(t *testing.T) {
			h := newHarness(t, []byte("old"))
			mutate(&h.checker)
			if got := h.check(t); got != reinstall.Skipped {
				t.Fatalf("got %q, want %q", got, reinstall.Skipped)
			}
			if len(h.started) != 0 {
				t.Fatalf("started %v, want nothing", h.started)
			}
		})
	}
}

func TestAStartFailureIsReportedAndStillThrottled(t *testing.T) {
	h := newHarness(t, []byte("old"))
	h.checker.Start = func(string, ...string) error { return errors.New("no systemd-run") }
	if _, err := h.checker.Check(); err == nil {
		t.Fatal("want an error when systemd-run cannot start")
	}
	// The attempt is recorded first, so a daemon that keeps failing to launch
	// the installer does not retry it on every restart either.
	if got := h.check(t); got != reinstall.Throttled {
		t.Fatalf("got %q, want %q", got, reinstall.Throttled)
	}
}
