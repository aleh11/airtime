package store_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/aleh11/airtime/internal/store"
)

func writeLegacyDatabase(t *testing.T, dir string) string {
	t.Helper()
	legacy, err := store.Open(dir)
	if err != nil {
		t.Fatalf("open legacy: %v", err)
	}
	if err := legacy.SetSetting("radio_config", "default_service", "MSF"); err != nil {
		t.Fatalf("seed setting: %v", err)
	}
	if err := legacy.SaveSchedule(store.Schedule{ID: "kept", Command: "c", Spec: "0 6 * * *", Enabled: true}); err != nil {
		t.Fatalf("seed schedule: %v", err)
	}
	if err := legacy.Close(); err != nil {
		t.Fatalf("close legacy: %v", err)
	}
	return legacy.Path()
}

func TestMigrateLegacyCarriesSettingsAndSchedules(t *testing.T) {
	legacyDir := t.TempDir()
	stateDir := filepath.Join(t.TempDir(), "state")
	legacyPath := writeLegacyDatabase(t, legacyDir)

	migrated, err := store.MigrateLegacy(legacyPath, stateDir)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if !migrated {
		t.Fatal("migrate reported nothing to do")
	}

	s, err := store.Open(stateDir)
	if err != nil {
		t.Fatalf("open migrated: %v", err)
	}
	defer s.Close()

	got, ok, err := s.Setting("radio_config", "default_service")
	if err != nil || !ok {
		t.Fatalf("setting missing after migration: ok=%v err=%v", ok, err)
	}
	if got != "MSF" {
		t.Fatalf("got %q, want %q", got, "MSF")
	}

	schedules, err := s.Schedules()
	if err != nil {
		t.Fatalf("schedules: %v", err)
	}
	if len(schedules) != 1 || schedules[0].ID != "kept" {
		t.Fatalf("got %+v, want the seeded schedule", schedules)
	}
}

func TestMigrateLegacyKeepsOriginalAsBackup(t *testing.T) {
	legacyDir := t.TempDir()
	stateDir := filepath.Join(t.TempDir(), "state")
	legacyPath := writeLegacyDatabase(t, legacyDir)

	if _, err := store.MigrateLegacy(legacyPath, stateDir); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	if _, err := os.Stat(legacyPath); !os.IsNotExist(err) {
		t.Fatal("legacy database still in place; it should have been renamed")
	}
	if _, err := os.Stat(legacyPath + ".migrated"); err != nil {
		t.Fatalf("backup missing: %v", err)
	}
}

func TestMigrateLegacyDoesNotOverwriteExistingState(t *testing.T) {
	legacyDir := t.TempDir()
	stateDir := t.TempDir()
	legacyPath := writeLegacyDatabase(t, legacyDir)

	current, err := store.Open(stateDir)
	if err != nil {
		t.Fatalf("open state: %v", err)
	}
	if err := current.SetSetting("radio_config", "default_service", "JJY60"); err != nil {
		t.Fatalf("seed: %v", err)
	}
	current.Close()

	migrated, err := store.MigrateLegacy(legacyPath, stateDir)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if migrated {
		t.Fatal("migrate overwrote an existing state database")
	}

	s, _ := store.Open(stateDir)
	defer s.Close()
	got, _, _ := s.Setting("radio_config", "default_service")
	if got != "JJY60" {
		t.Fatalf("existing state was clobbered: got %q", got)
	}
}

func TestMigrateLegacyWithNothingToMigrate(t *testing.T) {
	migrated, err := store.MigrateLegacy(filepath.Join(t.TempDir(), "absent.db"), t.TempDir())
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if migrated {
		t.Fatal("migrate claimed to move a database that does not exist")
	}
}
