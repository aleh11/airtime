package health_test

import (
	"testing"
	"time"

	"github.com/aleh11/airtime/internal/health"
)

func TestAntennaFollowsTheTransmitter(t *testing.T) {
	now := time.Date(2026, 11, 17, 9, 0, 0, 0, time.UTC)
	if !health.AntennaState(now, true, false, time.Time{}) {
		t.Fatal("dark while on air")
	}
	if health.AntennaState(now, false, false, time.Time{}) {
		t.Fatal("lit while off")
	}
}

func TestAntennaBlinksSlowlyWhileWaitingForTheClock(t *testing.T) {
	start := time.Date(2026, 11, 17, 9, 0, 0, 0, time.UTC)
	var changes int
	last := health.AntennaState(start, false, true, time.Time{})
	for ms := 50; ms <= 4000; ms += 50 {
		got := health.AntennaState(start.Add(time.Duration(ms)*time.Millisecond), false, true, time.Time{})
		if got != last {
			changes++
			last = got
		}
	}
	if changes != 4 {
		t.Fatalf("%d changes in 4s, want 4 (1s on, 1s off)", changes)
	}
}

func TestAntennaConfirmsWithThreeQuickBlinks(t *testing.T) {
	start := time.Date(2026, 11, 17, 9, 0, 0, 0, time.UTC)
	until := start.Add(health.ConfirmDuration)

	var flashes int
	last := false
	for ms := 0; ms < 600; ms += 10 {
		got := health.AntennaState(start.Add(time.Duration(ms)*time.Millisecond), true, false, until)
		if got && !last {
			flashes++
		}
		last = got
	}
	if flashes != 3 {
		t.Fatalf("%d flashes, want 3", flashes)
	}
	if !health.AntennaState(until, true, false, until) {
		t.Fatal("did not return to solid after confirming")
	}
}
