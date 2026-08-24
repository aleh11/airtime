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

func TestMissedWindowFiresOnceWithinTheGracePeriod(t *testing.T) {
	due, err := scheduler.Due([]store.Schedule{nightly()},
		at(t, "2026-08-22 23:54:00"), at(t, "2026-08-22 23:58:00"))
	if err != nil {
		t.Fatalf("due: %v", err)
	}
	if len(due) != 1 {
		t.Fatalf("got %d, want a single catch-up fire after a brief restart", len(due))
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

func TestNextTickAlignsToWallClock(t *testing.T) {
	// A schedule names a minute, so a tick has to land on :00 of that minute
	// however long the daemon has been up. Cron did; an unaligned ticker does not.
	cases := []struct {
		now  string
		want string
	}{
		{"2026-08-24T18:31:07Z", "2026-08-24T18:31:30Z"},
		{"2026-08-24T18:31:59Z", "2026-08-24T18:32:00Z"},
		{"2026-08-24T18:31:30Z", "2026-08-24T18:32:00Z"},
		{"2026-08-24T18:59:47Z", "2026-08-24T19:00:00Z"},
	}

	for _, tc := range cases {
		now, err := time.Parse(time.RFC3339, tc.now)
		if err != nil {
			t.Fatalf("parse %q: %v", tc.now, err)
		}
		want, err := time.Parse(time.RFC3339, tc.want)
		if err != nil {
			t.Fatalf("parse %q: %v", tc.want, err)
		}
		if got := scheduler.NextTick(now); !got.Equal(want) {
			t.Errorf("NextTick(%s) = %s, want %s", tc.now, got.Format(time.RFC3339), tc.want)
		}
	}
}
