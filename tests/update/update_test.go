package update_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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
