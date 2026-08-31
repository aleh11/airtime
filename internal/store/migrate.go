package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
)

// MigrateLegacy moves a database left behind by an in-tree install into the
// state directory. It reports whether anything was moved.
func MigrateLegacy(legacyPath, stateDir string) (bool, error) {
	target := filepath.Join(stateDir, dbFileName)

	if _, err := os.Stat(target); err == nil {
		return false, nil
	} else if !os.IsNotExist(err) {
		return false, fmt.Errorf("inspect state database: %w", err)
	}

	if _, err := os.Stat(legacyPath); os.IsNotExist(err) {
		return false, nil
	} else if err != nil {
		return false, fmt.Errorf("inspect legacy database: %w", err)
	}

	if err := os.MkdirAll(stateDir, 0o755); err != nil {
		return false, fmt.Errorf("create state dir: %w", err)
	}

	// VACUUM INTO rather than a file copy: the legacy database runs in WAL mode,
	// so recent writes can live only in the -wal sidecar.
	db, err := sql.Open("sqlite", legacyPath)
	if err != nil {
		return false, fmt.Errorf("open legacy database: %w", err)
	}
	defer db.Close()

	if _, err := db.Exec(`VACUUM INTO ?`, target); err != nil {
		return false, fmt.Errorf("copy legacy database: %w", err)
	}
	if err := db.Close(); err != nil {
		return false, fmt.Errorf("close legacy database: %w", err)
	}

	if err := os.Rename(legacyPath, legacyPath+".migrated"); err != nil {
		return false, fmt.Errorf("archive legacy database: %w", err)
	}
	for _, sidecar := range []string{"-wal", "-shm"} {
		os.Remove(legacyPath + sidecar)
	}

	return true, nil
}
