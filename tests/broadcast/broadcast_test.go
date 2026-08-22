package broadcast_test

import (
	"testing"
	"time"

	"github.com/aleh11/airtime/internal/broadcast"
	"github.com/aleh11/airtime/internal/store"
	"github.com/aleh11/airtime/internal/transmit"
)

type fakeRunner struct {
	started [][]string
	stopped int
	running bool
}

func (f *fakeRunner) Start(args []string) error {
	f.started = append(f.started, args)
	f.running = true
	return nil
}
func (f *fakeRunner) Stop()         { f.stopped++; f.running = false }
func (f *fakeRunner) Running() bool { return f.running }

func newController(t *testing.T) (*broadcast.Controller, *store.Store, *fakeRunner) {
	t.Helper()
	s, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { s.Close() })

	runner := &fakeRunner{}
	controller := broadcast.New(s, runner, func() time.Time {
		return time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)
	})
	return controller, s, runner
}

func TestStartRecordsTheBroadcast(t *testing.T) {
	controller, s, runner := newController(t)

	err := controller.Start(transmit.Request{
		Standard: "DCF77", DurationMinutes: 30,
		TimeMode: "time_now", Offset: 59, OffsetEnabled: true,
	})
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	if len(runner.started) != 1 {
		t.Fatalf("runner started %d times, want 1", len(runner.started))
	}

	var running bool
	s.Status("services", "txtempus_running", &running)
	if !running {
		t.Fatal("status does not report a running broadcast")
	}

	var details broadcast.Details
	s.Status("services", "txtempus_details", &details)
	if details.Standard != "DCF77" || details.Duration != 30 {
		t.Fatalf("got %+v", details)
	}
	if details.Offset == nil || *details.Offset != 59 {
		t.Fatalf("offset not recorded: %+v", details)
	}
}

// A scheduled broadcast must be reported exactly like a manual one, so the
// dashboard shows it as live.
func TestStartCommandRecordsTheBroadcast(t *testing.T) {
	controller, s, runner := newController(t)

	if err := controller.StartCommand("/usr/bin/txtempus -s DCF77 -r 360 -z 59"); err != nil {
		t.Fatalf("start command: %v", err)
	}
	if len(runner.started) != 1 {
		t.Fatalf("runner started %d times, want 1", len(runner.started))
	}

	var running bool
	s.Status("services", "txtempus_running", &running)
	if !running {
		t.Fatal("a scheduled broadcast left the status saying nothing is running")
	}

	var details broadcast.Details
	s.Status("services", "txtempus_details", &details)
	if details.Standard != "DCF77" || details.Duration != 360 {
		t.Fatalf("got %+v, want the scheduled standard and duration", details)
	}
}

func TestStopClearsTheRecord(t *testing.T) {
	controller, s, runner := newController(t)

	controller.Start(transmit.Request{Standard: "MSF", DurationMinutes: 10, TimeMode: "time_now"})
	controller.Stop()

	if runner.stopped != 1 {
		t.Fatalf("runner stopped %d times, want 1", runner.stopped)
	}

	var running bool
	s.Status("services", "txtempus_running", &running)
	if running {
		t.Fatal("status still reports a running broadcast after stop")
	}
}

func TestFinishedClearsTheRecord(t *testing.T) {
	controller, s, _ := newController(t)

	controller.Start(transmit.Request{Standard: "MSF", DurationMinutes: 1, TimeMode: "time_now"})
	controller.Finished()

	var running bool
	s.Status("services", "txtempus_running", &running)
	if running {
		t.Fatal("a broadcast that ran to completion still reports as running")
	}

	var details broadcast.Details
	s.Status("services", "txtempus_details", &details)
	if details.Standard != "" {
		t.Fatalf("details should be cleared, got %+v", details)
	}
}
