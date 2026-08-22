package scheduler_test

import (
	"testing"
	"time"

	"github.com/aleh11/airtime/internal/scheduler"
	"github.com/aleh11/airtime/internal/store"
)

type fakeRunner struct{ started [][]string }

func (f *fakeRunner) Start(args []string) error {
	f.started = append(f.started, args)
	return nil
}
func (f *fakeRunner) Stop()         {}
func (f *fakeRunner) Running() bool { return false }

func newService(t *testing.T) (*scheduler.Service, *store.Store, *fakeRunner) {
	t.Helper()
	s, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { s.Close() })

	runner := &fakeRunner{}
	return scheduler.NewService(s, runner), s, runner
}

func TestFirstTickEstablishesABaselineWithoutFiring(t *testing.T) {
	service, s, runner := newService(t)
	s.SaveSchedule(store.Schedule{ID: "nightly", Command: "/usr/bin/txtempus -s DCF77 -r 360", Spec: "55 23 * * *", Enabled: true})

	service.Tick(at(t, "2026-08-23 00:30:00"))

	if len(runner.started) != 0 {
		t.Fatalf("fired %d broadcasts on the first tick, want none", len(runner.started))
	}
}

func TestDueScheduleStartsABroadcast(t *testing.T) {
	service, s, runner := newService(t)
	s.SaveSchedule(store.Schedule{ID: "nightly", Command: "/usr/bin/txtempus -s DCF77 -r 360", Spec: "55 23 * * *", Enabled: true})

	service.Tick(at(t, "2026-08-22 23:54:00"))
	service.Tick(at(t, "2026-08-22 23:55:30"))

	if len(runner.started) != 1 {
		t.Fatalf("fired %d broadcasts, want 1", len(runner.started))
	}
	if runner.started[0][0] != "/usr/bin/txtempus" {
		t.Fatalf("got %v", runner.started[0])
	}
}

func TestScheduleDoesNotFireTwiceForOneOccurrence(t *testing.T) {
	service, s, runner := newService(t)
	s.SaveSchedule(store.Schedule{ID: "nightly", Command: "/usr/bin/txtempus -s DCF77 -r 360", Spec: "55 23 * * *", Enabled: true})

	service.Tick(at(t, "2026-08-22 23:54:00"))
	service.Tick(at(t, "2026-08-22 23:55:30"))
	service.Tick(at(t, "2026-08-22 23:56:30"))
	service.Tick(at(t, "2026-08-22 23:57:30"))

	if len(runner.started) != 1 {
		t.Fatalf("fired %d broadcasts, want 1", len(runner.started))
	}
}

func TestBaselineSurvivesARestart(t *testing.T) {
	service, s, _ := newService(t)
	s.SaveSchedule(store.Schedule{ID: "nightly", Command: "/usr/bin/txtempus -s DCF77 -r 360", Spec: "55 23 * * *", Enabled: true})
	service.Tick(at(t, "2026-08-22 23:54:00"))

	restarted := scheduler.NewService(s, &fakeRunner{})
	runner := &fakeRunner{}
	restarted = scheduler.NewService(s, runner)
	restarted.Tick(at(t, "2026-08-22 23:55:30"))

	if len(runner.started) != 1 {
		t.Fatalf("fired %d broadcasts after restart, want 1 catch-up", len(runner.started))
	}
}

func TestTimeTesterSuspendsSchedules(t *testing.T) {
	service, s, runner := newService(t)
	s.SaveSchedule(store.Schedule{ID: "nightly", Command: "/usr/bin/txtempus -s DCF77 -r 360", Spec: "55 23 * * *", Enabled: true})
	s.SetSetting("app_config", "time_tester_active", "true")

	service.Tick(at(t, "2026-08-22 23:54:00"))
	service.Tick(at(t, "2026-08-22 23:55:30"))

	if len(runner.started) != 0 {
		t.Fatalf("fired %d broadcasts while the time tester was active, want none", len(runner.started))
	}
}

var _ = time.Second
