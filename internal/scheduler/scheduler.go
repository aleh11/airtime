package scheduler

import (
	"errors"
	"fmt"
	"time"

	"github.com/aleh11/airtime/internal/store"
	"github.com/robfig/cron/v3"
)

var specParser = cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)

// Due reports which schedules should fire for the window (last, now]. A
// schedule that was missed entirely while the daemon was down fires once on
// return rather than once per missed occurrence.
func Due(schedules []store.Schedule, last, now time.Time) ([]store.Schedule, error) {
	var due []store.Schedule
	var problems []error

	for _, sc := range schedules {
		if !sc.Enabled {
			continue
		}

		spec, err := specParser.Parse(sc.Spec)
		if err != nil {
			problems = append(problems, fmt.Errorf("schedule %s has an invalid spec %q: %w", sc.ID, sc.Spec, err))
			continue
		}

		next := spec.Next(last)
		if !next.After(now) {
			due = append(due, sc)
		}
	}

	return due, errors.Join(problems...)
}
