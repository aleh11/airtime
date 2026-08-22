package store

import "fmt"

// Schedule is persisted in the legacy cron_jobs table so that databases written
// by the Python daemon keep working after the Go port.
type Schedule struct {
	ID      string
	Command string
	Spec    string
	Enabled bool
}

func (s *Store) Schedules() ([]Schedule, error) {
	rows, err := s.db.Query(`SELECT id, command, schedule, enabled FROM cron_jobs ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("list schedules: %w", err)
	}
	defer rows.Close()

	var out []Schedule
	for rows.Next() {
		var sc Schedule
		if err := rows.Scan(&sc.ID, &sc.Command, &sc.Spec, &sc.Enabled); err != nil {
			return nil, fmt.Errorf("scan schedule: %w", err)
		}
		out = append(out, sc)
	}
	return out, rows.Err()
}

func (s *Store) SaveSchedule(sc Schedule) error {
	_, err := s.db.Exec(
		`INSERT INTO cron_jobs (id, command, schedule, enabled, updated_at)
		 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(id) DO UPDATE SET
		     command = excluded.command,
		     schedule = excluded.schedule,
		     enabled = excluded.enabled,
		     updated_at = CURRENT_TIMESTAMP`,
		sc.ID, sc.Command, sc.Spec, sc.Enabled,
	)
	if err != nil {
		return fmt.Errorf("save schedule %s: %w", sc.ID, err)
	}
	return nil
}

func (s *Store) DeleteSchedule(id string) (bool, error) {
	res, err := s.db.Exec(`DELETE FROM cron_jobs WHERE id = ?`, id)
	if err != nil {
		return false, fmt.Errorf("delete schedule %s: %w", id, err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("delete schedule %s: %w", id, err)
	}
	return affected > 0, nil
}
