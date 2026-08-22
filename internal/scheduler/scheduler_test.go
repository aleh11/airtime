package scheduler_test

import (
	"testing"
	"time"

	"github.com/aleh11/airtime/internal/scheduler"
	"github.com/aleh11/airtime/internal/store"
)

func at(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.ParseInLocation("2006-01-02 15:04:05", value, time.UTC)
	if err != nil {
		t.Fatalf("parse time: %v", err)
	}
	return parsed
}

func nightly() store.Schedule {
	return store.Schedule{
		ID:      "nightly-dcf77",
		Command: "/usr/bin/txtempus -s DCF77 -r 360",
		Spec:    "55 23 * * *",
		Enabled: true,
	}
}

func TestScheduleIsDueWhenItsTimePassed(t *testing.T) {
	due, err := scheduler.Due([]store.Schedule{nightly()},
		at(t, "2026-08-22 23:54:00"), at(t, "2026-08-22 23:55:30"))
	if err != nil {
		t.Fatalf("due: %v", err)
	}
	if len(due) != 1 || due[0].ID != "nightly-dcf77" {
		t.Fatalf("got %+v, want the nightly schedule", due)
	}
}

func TestScheduleIsNotDueBeforeItsTime(t *testing.T) {
	due, err := scheduler.Due([]store.Schedule{nightly()},
		at(t, "2026-08-22 23:50:00"), at(t, "2026-08-22 23:54:00"))
	if err != nil {
		t.Fatalf("due: %v", err)
	}
	if len(due) != 0 {
		t.Fatalf("got %+v, want nothing due", due)
	}
}

func TestScheduleFiresOnlyOncePerOccurrence(t *testing.T) {
	last := at(t, "2026-08-22 23:54:00")
	now := at(t, "2026-08-22 23:55:30")

	due, err := scheduler.Due([]store.Schedule{nightly()}, last, now)
	if err != nil {
		t.Fatalf("first window: %v", err)
	}
	if len(due) != 1 {
		t.Fatalf("first window got %d, want 1", len(due))
	}

	due, err = scheduler.Due([]store.Schedule{nightly()}, now, at(t, "2026-08-22 23:57:00"))
	if err != nil {
		t.Fatalf("second window: %v", err)
	}
	if len(due) != 0 {
		t.Fatalf("second window got %+v, want nothing due", due)
	}
}

func TestDisabledScheduleNeverFires(t *testing.T) {
	disabled := nightly()
	disabled.Enabled = false

	due, err := scheduler.Due([]store.Schedule{disabled},
		at(t, "2026-08-22 23:54:00"), at(t, "2026-08-22 23:56:00"))
	if err != nil {
		t.Fatalf("due: %v", err)
	}
	if len(due) != 0 {
		t.Fatalf("got %+v, want nothing due for a disabled schedule", due)
	}
}

func TestMissedWindowStillFiresOnce(t *testing.T) {
	due, err := scheduler.Due([]store.Schedule{nightly()},
		at(t, "2026-08-20 12:00:00"), at(t, "2026-08-22 12:00:00"))
	if err != nil {
		t.Fatalf("due: %v", err)
	}
	if len(due) != 1 {
		t.Fatalf("got %d, want a single catch-up fire after downtime", len(due))
	}
}

func TestInvalidSpecIsReportedAndDoesNotBlockOthers(t *testing.T) {
	broken := store.Schedule{ID: "broken", Command: "c", Spec: "not a cron spec", Enabled: true}

	due, err := scheduler.Due([]store.Schedule{broken, nightly()},
		at(t, "2026-08-22 23:54:00"), at(t, "2026-08-22 23:56:00"))
	if err == nil {
		t.Fatal("expected an error describing the invalid spec")
	}
	if len(due) != 1 || due[0].ID != "nightly-dcf77" {
		t.Fatalf("got %+v, want the valid schedule to still fire", due)
	}
}
