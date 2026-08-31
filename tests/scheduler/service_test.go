package scheduler_test

import (
	"testing"
	"time"

	"github.com/aleh11/airtime/internal/scheduler"
	"github.com/aleh11/airtime/internal/store"
)

type fakeRunner struct{ started []string }

func (f *fakeRunner) StartCommand(command string) error {
	f.started = append(f.started, command)
	return nil
}

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
	if runner.started[0] != "/usr/bin/txtempus -s DCF77 -r 360" {
		t.Fatalf("got %q", runner.started[0])
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

// The chrony jump at boot reads as downtime; on hardware this fired five at once.
func TestClockJumpForwardDoesNotFireEverything(t *testing.T) {
	service, s, runner := newService(t)
	s.SaveSchedule(store.Schedule{ID: "nightly", Command: "/usr/bin/txtempus -s DCF77 -r 360", Spec: "55 23 * * *", Enabled: true})
	s.SaveSchedule(store.Schedule{ID: "noon", Command: "/usr/bin/txtempus -s DCF77 -r 10", Spec: "0 12 * * *", Enabled: true})

	// Boot with a stale clock, then chrony corrects it six months forward.
	service.Tick(at(t, "2026-02-08 22:31:00"))
	service.Tick(at(t, "2026-08-22 16:27:00"))

	if len(runner.started) != 0 {
		t.Fatalf("fired %d broadcasts after a clock correction, want none", len(runner.started))
	}
}

func TestClockJumpBackwardsDoesNotFire(t *testing.T) {
	service, s, runner := newService(t)
	s.SaveSchedule(store.Schedule{ID: "nightly", Command: "/usr/bin/txtempus -s DCF77 -r 360", Spec: "55 23 * * *", Enabled: true})

	service.Tick(at(t, "2026-08-22 16:00:00"))
	service.Tick(at(t, "2026-02-08 22:31:00"))

	if len(runner.started) != 0 {
		t.Fatalf("fired %d broadcasts after the clock went backwards, want none", len(runner.started))
	}
}

func TestScheduleFiresNormallyAfterAClockCorrection(t *testing.T) {
	service, s, runner := newService(t)
	s.SaveSchedule(store.Schedule{ID: "nightly", Command: "/usr/bin/txtempus -s DCF77 -r 360", Spec: "55 23 * * *", Enabled: true})

	service.Tick(at(t, "2026-02-08 22:31:00"))
	service.Tick(at(t, "2026-08-22 16:27:00"))
	// Ticks are 30s apart in practice, so the baseline recovers and the next
	// genuine occurrence still fires.
	service.Tick(at(t, "2026-08-22 23:54:50"))
	service.Tick(at(t, "2026-08-22 23:55:10"))

	if len(runner.started) != 1 {
		t.Fatalf("fired %d broadcasts, want the next real occurrence to still fire", len(runner.started))
	}
}
