package store

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

const dbFileName = "airtime.db"

const schema = `
CREATE TABLE IF NOT EXISTS settings (
    category TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (category, key)
);

CREATE TABLE IF NOT EXISTS status (
    section TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (section, key)
);

CREATE TABLE IF NOT EXISTS cron_jobs (
    id TEXT PRIMARY KEY,
    command TEXT NOT NULL,
    schedule TEXT NOT NULL,
    enabled BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);
CREATE INDEX IF NOT EXISTS idx_status_section ON status(section);
`

type Store struct {
	db   *sql.DB
	path string
}

func Open(stateDir string) (*Store, error) {
	if err := os.MkdirAll(stateDir, 0o755); err != nil {
		return nil, fmt.Errorf("create state dir: %w", err)
	}

	path := filepath.Join(stateDir, dbFileName)
	db, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)")
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("apply schema: %w", err)
	}

	return &Store{db: db, path: path}, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) Path() string { return s.path }

func (s *Store) Setting(category, key string) (string, bool, error) {
	var value string
	err := s.db.QueryRow(
		`SELECT value FROM settings WHERE category = ? AND key = ?`,
		category, key,
	).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("read setting %s.%s: %w", category, key, err)
	}
	return value, true, nil
}

func (s *Store) SetSetting(category, key, value string) error {
	_, err := s.db.Exec(
		`INSERT INTO settings (category, key, value, updated_at)
		 VALUES (?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(category, key) DO UPDATE SET
		     value = excluded.value,
		     updated_at = CURRENT_TIMESTAMP`,
		category, key, value,
	)
	if err != nil {
		return fmt.Errorf("write setting %s.%s: %w", category, key, err)
	}
	return nil
}

func (s *Store) Category(category string) (map[string]string, error) {
	rows, err := s.db.Query(`SELECT key, value FROM settings WHERE category = ?`, category)
	if err != nil {
		return nil, fmt.Errorf("read category %s: %w", category, err)
	}
	defer rows.Close()

	out := map[string]string{}
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, fmt.Errorf("scan category %s: %w", category, err)
		}
		out[key] = value
	}
	return out, rows.Err()
}
