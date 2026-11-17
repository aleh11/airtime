package transmit_test

import (
	"testing"
	"time"

	"github.com/aleh11/airtime/internal/transmit"
)

// exitWait is long enough for a killed child to be reaped and its exit reported.
const exitWait = 500 * time.Millisecond

func TestRunnerReportsANaturalExit(t *testing.T) {
	exits := make(chan error, 4)
	runner := transmit.NewRunner(func(err error) { exits <- err })

	if err := runner.Start([]string{"true"}); err != nil {
		t.Fatalf("start: %v", err)
	}

	select {
	case <-exits:
	case <-time.After(5 * time.Second):
		t.Fatal("natural exit was not reported")
	}
	if runner.Running() {
		t.Fatal("runner still reports running after the process exited")
	}
}

// Replacing a broadcast kills the old process; its exit must not be reported,
// or the caller clears the record of the broadcast that replaced it.
func TestRunnerDoesNotReportAReplacedProcess(t *testing.T) {
	exits := make(chan error, 4)
	runner := transmit.NewRunner(func(err error) { exits <- err })
	t.Cleanup(runner.Stop)

	if err := runner.Start([]string{"sleep", "30"}); err != nil {
		t.Fatalf("first start: %v", err)
	}
	if err := runner.Start([]string{"sleep", "30"}); err != nil {
		t.Fatalf("second start: %v", err)
	}

	select {
	case err := <-exits:
		t.Fatalf("replaced process reported an exit: %v", err)
	case <-time.After(exitWait):
	}
	if !runner.Running() {
		t.Fatal("replacement process is not reported as running")
	}
}

func TestRunnerDoesNotReportAStoppedProcess(t *testing.T) {
	exits := make(chan error, 4)
	runner := transmit.NewRunner(func(err error) { exits <- err })

	if err := runner.Start([]string{"sleep", "30"}); err != nil {
		t.Fatalf("start: %v", err)
	}
	runner.Stop()

	select {
	case err := <-exits:
		t.Fatalf("stopped process reported an exit: %v", err)
	case <-time.After(exitWait):
	}
}
