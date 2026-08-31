package store_test

import (
	"path/filepath"
	"testing"

	"github.com/aleh11/airtime/internal/store"
)

func openTemp(t *testing.T) *store.Store {
	t.Helper()
	s, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestSettingRoundTrips(t *testing.T) {
	s := openTemp(t)

	if err := s.SetSetting("radio_config", "default_service", "WWVB"); err != nil {
		t.Fatalf("set: %v", err)
	}

	got, ok, err := s.Setting("radio_config", "default_service")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if !ok {
		t.Fatal("setting reported missing after write")
	}
	if got != "WWVB" {
		t.Fatalf("got %q, want %q", got, "WWVB")
	}
}

func TestSettingOverwrites(t *testing.T) {
	s := openTemp(t)

	if err := s.SetSetting("radio_config", "default_offset", "0"); err != nil {
		t.Fatalf("set: %v", err)
	}
	if err := s.SetSetting("radio_config", "default_offset", "-60"); err != nil {
		t.Fatalf("overwrite: %v", err)
	}

	got, _, err := s.Setting("radio_config", "default_offset")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got != "-60" {
		t.Fatalf("got %q, want %q", got, "-60")
	}
}

func TestMissingSettingIsNotAnError(t *testing.T) {
	s := openTemp(t)

	_, ok, err := s.Setting("radio_config", "nope")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Fatal("reported a setting that was never written")
	}
}

func TestDatabaseFileLandsInStateDir(t *testing.T) {
	dir := t.TempDir()
	s, err := store.Open(dir)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer s.Close()

	if s.Path() != filepath.Join(dir, "airtime.db") {
		t.Fatalf("got %q, want %q", s.Path(), filepath.Join(dir, "airtime.db"))
	}
}
