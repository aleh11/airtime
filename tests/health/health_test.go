package health_test

import (
	"testing"
	"time"

	"github.com/aleh11/airtime/internal/health"
)

func TestBlinkerFlashesBrieflyThenWaitsTheInterval(t *testing.T) {
	// The pattern the hat has always used: a short flash, then a gap that
	// carries the meaning. A 50% duty cycle would read as a different signal.
	start := time.Date(2026, 8, 26, 12, 0, 0, 0, time.UTC)
	blinker := health.Blinker{Interval: time.Second}

	// The first tick lights it, as the original does: an LED that waits a full
	// interval before its first flash looks dead on a slow score.
	if !blinker.State(start) {
		t.Fatal("dark on the first tick, want an immediate flash")
	}
	if !blinker.State(start.Add(50 * time.Millisecond)) {
		t.Fatal("flash ended early, want it to last FlashDuration")
	}
	if blinker.State(start.Add(health.FlashDuration)) {
		t.Fatal("flash outlasted FlashDuration")
	}
	if blinker.State(start.Add(health.FlashDuration + 500*time.Millisecond)) {
		t.Fatal("lit again mid-gap, want the full interval of darkness")
	}
	if !blinker.State(start.Add(health.FlashDuration + time.Second)) {
		t.Fatal("no second flash after the interval elapsed")
	}
}

func TestBlinkerStaysDarkWithoutAnInterval(t *testing.T) {
	// Zero means the thing being reported is offline, not that it blinks fast.
	blinker := health.Blinker{Interval: 0}
	now := time.Now()
	for i := 0; i < 5; i++ {
		if blinker.State(now.Add(time.Duration(i) * time.Second)) {
			t.Fatal("lit with no interval set")
		}
	}
}

func TestScoreIntervalMapsScoresToSeconds(t *testing.T) {
	if got := health.ScoreInterval(0.1); got != 100*time.Millisecond {
		t.Fatalf("got %v, want 100ms", got)
	}
	if got := health.ScoreInterval(10); got != 10*time.Second {
		t.Fatalf("got %v, want 10s", got)
	}
	if got := health.ScoreInterval(0); got != 0 {
		t.Fatalf("got %v, want 0 for an offline check", got)
	}
}
