package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

// Status reads a status value into target, reporting whether it was present.
func (s *Store) Status(section, key string, target any) (bool, error) {
	var raw string
	err := s.db.QueryRow(
		`SELECT value FROM status WHERE section = ? AND key = ?`,
		section, key,
	).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read status %s.%s: %w", section, key, err)
	}
	if err := json.Unmarshal([]byte(raw), target); err != nil {
		return false, fmt.Errorf("decode status %s.%s: %w", section, key, err)
	}
	return true, nil
}

func (s *Store) SetStatus(section, key string, value any) error {
	encoded, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("encode status %s.%s: %w", section, key, err)
	}
	_, err = s.db.Exec(
		`INSERT INTO status (section, key, value, updated_at)
		 VALUES (?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(section, key) DO UPDATE SET
		     value = excluded.value,
		     updated_at = CURRENT_TIMESTAMP`,
		section, key, string(encoded),
	)
	if err != nil {
		return fmt.Errorf("write status %s.%s: %w", section, key, err)
	}
	return nil
}
