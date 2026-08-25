package metrics_test

import (
	"context"
	"testing"
	"time"

	"github.com/aleh11/airtime/internal/metrics"
)

func TestCollectorReportsZeroUntilItHasTwoReadings(t *testing.T) {
	// A rate needs two readings. Reporting something non-zero from a single one
	// would be inventing a number.
	collector := metrics.NewCollector()
	if got := collector.Snapshot().CPU.Percent; got != 0 {
		t.Fatalf("got %v before any sampling, want 0", got)
	}
}

func TestCollectorSamplesOnItsOwnCadence(t *testing.T) {
	// The reading must not depend on how often Snapshot is called: that was the
	// bug, where a caller measured the window since whoever asked last.
	collector := metrics.NewCollector()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go collector.Run(ctx)

	deadline := time.Now().Add(3 * time.Second)
	var percent float64
	for time.Now().Before(deadline) {
		if percent = collector.Snapshot().CPU.Percent; percent > 0 {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	if percent < 0 || percent > 100 {
		t.Fatalf("got %v, want a utilisation between 0 and 100", percent)
	}

	first := collector.Snapshot().CPU.Percent
	second := collector.Snapshot().CPU.Percent
	if first != second {
		t.Fatalf("back-to-back reads gave %v then %v; the value must not move with the caller", first, second)
	}
}
