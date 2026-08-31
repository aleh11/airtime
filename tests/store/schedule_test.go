package store_test

import (
	"testing"

	"github.com/aleh11/airtime/internal/store"
)

func TestSaveAndListSchedules(t *testing.T) {
	s := openTemp(t)

	want := store.Schedule{
		ID:      "nightly-dcf77",
		Command: "/usr/bin/txtempus -s DCF77 -r 360",
		Spec:    "55 23 * * *",
		Enabled: true,
	}
	if err := s.SaveSchedule(want); err != nil {
		t.Fatalf("save: %v", err)
	}

	got, err := s.Schedules()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("got %d schedules, want 1", len(got))
	}
	if got[0] != want {
		t.Fatalf("got %+v, want %+v", got[0], want)
	}
}

func TestSaveScheduleReplacesSameID(t *testing.T) {
	s := openTemp(t)

	base := store.Schedule{ID: "nightly", Command: "cmd", Spec: "0 1 * * *", Enabled: true}
	if err := s.SaveSchedule(base); err != nil {
		t.Fatalf("save: %v", err)
	}
	base.Spec = "30 2 * * *"
	base.Enabled = false
	if err := s.SaveSchedule(base); err != nil {
		t.Fatalf("resave: %v", err)
	}

	got, err := s.Schedules()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("got %d schedules, want 1 after replacing", len(got))
	}
	if got[0].Spec != "30 2 * * *" || got[0].Enabled {
		t.Fatalf("got %+v, want updated spec and disabled", got[0])
	}
}

func TestDeleteScheduleReportsWhetherItExisted(t *testing.T) {
	s := openTemp(t)

	if err := s.SaveSchedule(store.Schedule{ID: "doomed", Command: "c", Spec: "* * * * *", Enabled: true}); err != nil {
		t.Fatalf("save: %v", err)
	}

	existed, err := s.DeleteSchedule("doomed")
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	if !existed {
		t.Fatal("delete reported the schedule was absent")
	}

	existed, err = s.DeleteSchedule("doomed")
	if err != nil {
		t.Fatalf("second delete: %v", err)
	}
	if existed {
		t.Fatal("delete reported a schedule that was already gone")
	}
}
