package update_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aleh11/airtime/internal/update"
)

func releaseServer(t *testing.T, tag string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"tag_name":"` + tag + `","html_url":"https://example.test/release"}`))
	}))
}

func TestCheckReportsAnAvailableUpdate(t *testing.T) {
	server := releaseServer(t, "v0.4.0")
	defer server.Close()

	checker := update.Checker{Current: "v0.3.0", ReleaseAPI: server.URL, Client: server.Client()}
	got, err := checker.Check()
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if !got.Available {
		t.Fatalf("got %+v, want an available update", got)
	}
	if got.Latest != "v0.4.0" || got.Current != "v0.3.0" {
		t.Fatalf("got %+v", got)
	}
}

func TestCheckReportsWhenUpToDate(t *testing.T) {
	server := releaseServer(t, "v0.3.0")
	defer server.Close()

	checker := update.Checker{Current: "v0.3.0", ReleaseAPI: server.URL, Client: server.Client()}
	got, err := checker.Check()
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if got.Available {
		t.Fatalf("got %+v, want no update", got)
	}
}

func TestCheckFailsLoudlyOnABadResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusInternalServerError)
	}))
	defer server.Close()

	checker := update.Checker{Current: "v0.3.0", ReleaseAPI: server.URL, Client: server.Client()}
	if _, err := checker.Check(); err == nil {
		t.Fatal("expected an error for a failed release lookup")
	}
}

func TestApplyWritesAnUpdateRequest(t *testing.T) {
	dir := t.TempDir()
	requestPath := filepath.Join(dir, "update.request")

	checker := update.Checker{Current: "v0.3.0", RequestPath: requestPath}
	if err := checker.Apply(); err != nil {
		t.Fatalf("apply: %v", err)
	}

	contents, err := os.ReadFile(requestPath)
	if err != nil {
		t.Fatalf("request file missing: %v", err)
	}
	if len(contents) == 0 {
		t.Fatal("request file is empty; the helper needs something to act on")
	}
}

func TestApplyWithoutARequestPathIsAnError(t *testing.T) {
	checker := update.Checker{Current: "v0.3.0"}
	if err := checker.Apply(); err == nil {
		t.Fatal("expected an error when no request path is configured")
	}
}

func listServer(t *testing.T, body string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(body))
	}))
}

func TestStableChannelNeverSeesAPrerelease(t *testing.T) {
	stable := releaseServer(t, "v0.3.0")
	defer stable.Close()
	// The list endpoint would offer the prerelease, so failing to consult it is
	// exactly what keeps a stable install off beta builds.
	prerelease := listServer(t, `[{"tag_name":"v0.4.0-rc.1","prerelease":true}]`)
	defer prerelease.Close()

	checker := update.Checker{
		Current:       "v0.3.0",
		ReleaseAPI:    stable.URL,
		PrereleaseAPI: prerelease.URL,
		Client:        stable.Client(),
	}
	got, err := checker.Check()
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if got.Available || got.Latest != "v0.3.0" {
		t.Fatalf("got %+v, want to stay on v0.3.0", got)
	}
	if got.Channel != "stable" {
		t.Fatalf("got channel %q, want stable", got.Channel)
	}
}

func TestBetaChannelTakesTheNewestReleaseOfAnyKind(t *testing.T) {
	list := listServer(t, `[
		{"tag_name":"v0.4.0-rc.1","prerelease":true,"html_url":"https://example.test/rc"},
		{"tag_name":"v0.3.0","prerelease":false}
	]`)
	defer list.Close()

	checker := update.Checker{
		Current:       "v0.3.0",
		PrereleaseAPI: list.URL,
		Client:        list.Client(),
		Beta:          func() bool { return true },
	}
	got, err := checker.Check()
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if !got.Available || got.Latest != "v0.4.0-rc.1" {
		t.Fatalf("got %+v, want the prerelease", got)
	}
	if !got.Prerelease || got.Channel != "beta" {
		t.Fatalf("got %+v, want a beta prerelease", got)
	}
}

func TestBetaChannelSkipsDrafts(t *testing.T) {
	list := listServer(t, `[
		{"tag_name":"v0.5.0","draft":true},
		{"tag_name":"v0.4.0-rc.1","prerelease":true}
	]`)
	defer list.Close()

	checker := update.Checker{
		Current:       "v0.3.0",
		PrereleaseAPI: list.URL,
		Client:        list.Client(),
		Beta:          func() bool { return true },
	}
	got, err := checker.Check()
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if got.Latest != "v0.4.0-rc.1" {
		t.Fatalf("got %+v, want the draft skipped", got)
	}
}

func TestApplyWritesTheResolvedTag(t *testing.T) {
	server := releaseServer(t, "v0.4.0")
	defer server.Close()

	requestPath := filepath.Join(t.TempDir(), "update.request")
	checker := update.Checker{
		Current:     "v0.3.0",
		ReleaseAPI:  server.URL,
		Client:      server.Client(),
		RequestPath: requestPath,
	}
	if err := checker.Apply(); err != nil {
		t.Fatalf("apply: %v", err)
	}

	contents, err := os.ReadFile(requestPath)
	if err != nil {
		t.Fatalf("read request: %v", err)
	}
	if got := strings.TrimSpace(string(contents)); got != "v0.4.0" {
		t.Fatalf("request contains %q, want the resolved tag", got)
	}
}

func TestBetaChannelRanksByVersionNotByDate(t *testing.T) {
	// GitHub lists newest-first, so a hotfix cut from master appears above a
	// beta it ranks below. Trusting that order would offer a downgrade.
	list := listServer(t, `[
		{"tag_name":"v0.3.1","prerelease":false},
		{"tag_name":"v0.4.0-beta.12","prerelease":true}
	]`)
	defer list.Close()

	checker := update.Checker{
		Current:       "v0.4.0-beta.12",
		PrereleaseAPI: list.URL,
		Client:        list.Client(),
		Beta:          func() bool { return true },
	}
	got, err := checker.Check()
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if got.Latest != "v0.4.0-beta.12" || got.Available {
		t.Fatalf("got %+v, want to stay on the newer beta", got)
	}
}

func TestBetaChannelOrdersBetaBuildsNumerically(t *testing.T) {
	// beta.9 must not beat beta.12: semver compares numeric identifiers as
	// numbers, where a plain string sort would get this backwards.
	list := listServer(t, `[
		{"tag_name":"v0.4.0-beta.9","prerelease":true},
		{"tag_name":"v0.4.0-beta.12","prerelease":true}
	]`)
	defer list.Close()

	checker := update.Checker{
		Current:       "v0.4.0-beta.9",
		PrereleaseAPI: list.URL,
		Client:        list.Client(),
		Beta:          func() bool { return true },
	}
	got, err := checker.Check()
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if got.Latest != "v0.4.0-beta.12" {
		t.Fatalf("got %+v, want beta.12", got)
	}
}

func TestBetaChannelTakesAFinalReleaseOverItsOwnPrereleases(t *testing.T) {
	list := listServer(t, `[
		{"tag_name":"v0.4.0-beta.12","prerelease":true},
		{"tag_name":"v0.4.0","prerelease":false}
	]`)
	defer list.Close()

	checker := update.Checker{
		Current:       "v0.4.0-beta.12",
		PrereleaseAPI: list.URL,
		Client:        list.Client(),
		Beta:          func() bool { return true },
	}
	got, err := checker.Check()
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if got.Latest != "v0.4.0" || !got.Available {
		t.Fatalf("got %+v, want the final release", got)
	}
}

func TestStableChannelDoesNotOfferADowngradeToABetaInstall(t *testing.T) {
	// Switching back to stable while running a beta leaves the install ahead of
	// the stable release. It should sit there until stable catches up.
	stable := releaseServer(t, "v0.3.0")
	defer stable.Close()

	checker := update.Checker{Current: "v0.4.0-beta.6", ReleaseAPI: stable.URL, Client: stable.Client()}
	got, err := checker.Check()
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if got.Available {
		t.Fatalf("got %+v, want no update offered", got)
	}
}
