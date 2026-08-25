package api_test

import (
	"net/http"
	"testing"
)

func TestUIConfigReturnsDefaultsBeforeAnythingIsSaved(t *testing.T) {
	h, _, _ := newServer(t)

	rec := do(t, h, http.MethodGet, "/api/settings/ui", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}

	got := decode(t, rec)
	if got["theme"] != "airtime-dark" {
		t.Fatalf("got %v, want airtime-dark", got["theme"])
	}
	if got["layout"] != "" {
		t.Fatalf("got %v, want no stored layout", got["layout"])
	}
	themes, ok := got["available_themes"].([]any)
	if !ok || len(themes) == 0 {
		t.Fatalf("got %v, want the theme list", got["available_themes"])
	}
}

func TestUIConfigRoundTrips(t *testing.T) {
	h, _, _ := newServer(t)

	rec := do(t, h, http.MethodPost, "/api/settings/ui",
		`{"theme":"nord","layout":"{\"v\":1}","hidden_widgets":["performance"]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}

	got := decode(t, do(t, h, http.MethodGet, "/api/settings/ui", ""))
	if got["theme"] != "nord" {
		t.Fatalf("theme: got %v", got["theme"])
	}
	if got["layout"] != `{"v":1}` {
		t.Fatalf("layout: got %v", got["layout"])
	}
	hidden, ok := got["hidden_widgets"].([]any)
	if !ok || len(hidden) != 1 || hidden[0] != "performance" {
		t.Fatalf("hidden_widgets: got %v", got["hidden_widgets"])
	}
}

func TestUIConfigRejectsUnknownThemeAndKeepsTheStoredOne(t *testing.T) {
	h, _, _ := newServer(t)

	if rec := do(t, h, http.MethodPost, "/api/settings/ui", `{"theme":"nord"}`); rec.Code != http.StatusOK {
		t.Fatalf("seed status %d: %s", rec.Code, rec.Body)
	}

	rec := do(t, h, http.MethodPost, "/api/settings/ui", `{"theme":"../../etc/passwd"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}

	got := decode(t, do(t, h, http.MethodGet, "/api/settings/ui", ""))
	if got["theme"] != "nord" {
		t.Fatalf("theme changed despite the rejection: got %v", got["theme"])
	}
}

func TestUIConfigRejectsALayoutThatIsNotJSON(t *testing.T) {
	h, _, _ := newServer(t)

	rec := do(t, h, http.MethodPost, "/api/settings/ui", `{"theme":"nord","layout":"not json"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestUIConfigRejectsAnOversizedLayout(t *testing.T) {
	h, _, _ := newServer(t)

	huge := make([]byte, 17*1024)
	for i := range huge {
		huge[i] = 'a'
	}
	rec := do(t, h, http.MethodPost, "/api/settings/ui",
		`{"theme":"nord","layout":"`+string(huge)+`"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}
