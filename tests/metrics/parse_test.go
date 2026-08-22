package metrics_test

import (
	"testing"

	"github.com/aleh11/airtime/internal/metrics"
)

const meminfoSample = `MemTotal:         444444 kB
MemFree:           50000 kB
MemAvailable:     222222 kB
Buffers:           10000 kB
SwapTotal:        102396 kB
SwapFree:          92396 kB
`

func TestParseMeminfoReportsBytesAndPercent(t *testing.T) {
	got, err := metrics.ParseMeminfo(meminfoSample)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if got.Total != 444444*1024 {
		t.Fatalf("total: got %d, want %d", got.Total, 444444*1024)
	}
	if got.Available != 222222*1024 {
		t.Fatalf("available: got %d, want %d", got.Available, 222222*1024)
	}
	// 50% available means 50% used.
	if got.Percent < 49.9 || got.Percent > 50.1 {
		t.Fatalf("percent: got %v, want ~50", got.Percent)
	}
	// 10000 of 102396 kB swap used.
	if got.SwapPercent < 9.6 || got.SwapPercent > 9.9 {
		t.Fatalf("swap percent: got %v, want ~9.77", got.SwapPercent)
	}
}

func TestParseMeminfoRejectsGarbage(t *testing.T) {
	if _, err := metrics.ParseMeminfo("not meminfo"); err == nil {
		t.Fatal("garbage accepted")
	}
}

const statSample = `cpu  10000 0 5000 85000 0 0 0 0 0 0
cpu0 2500 0 1250 21250 0 0 0 0 0 0
cpu1 2500 0 1250 21250 0 0 0 0 0 0
intr 12345
`

func TestCPUPercentFromTwoSamples(t *testing.T) {
	first, err := metrics.ParseStat(statSample)
	if err != nil {
		t.Fatalf("parse first: %v", err)
	}

	// 100 more jiffies of work, 100 more idle: 50% busy.
	const later = `cpu  10100 0 5000 85100 0 0 0 0 0 0
cpu0 2550 0 1250 21300 0 0 0 0 0 0
cpu1 2550 0 1250 21300 0 0 0 0 0 0
`
	second, err := metrics.ParseStat(later)
	if err != nil {
		t.Fatalf("parse second: %v", err)
	}

	percent := metrics.CPUPercent(first.Total, second.Total)
	if percent < 49.9 || percent > 50.1 {
		t.Fatalf("got %v, want ~50", percent)
	}

	perCore := metrics.PerCorePercent(first.PerCore, second.PerCore)
	if len(perCore) != 2 {
		t.Fatalf("got %d cores, want 2", len(perCore))
	}
	if perCore[0] < 49.9 || perCore[0] > 50.1 {
		t.Fatalf("core 0: got %v, want ~50", perCore[0])
	}
}

func TestCPUPercentWithNoElapsedTimeIsZero(t *testing.T) {
	sample, _ := metrics.ParseStat(statSample)
	if got := metrics.CPUPercent(sample.Total, sample.Total); got != 0 {
		t.Fatalf("got %v, want 0", got)
	}
}

func TestParseTemperature(t *testing.T) {
	got, err := metrics.ParseTemperature("48312\n")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got < 48.3 || got > 48.4 {
		t.Fatalf("got %v, want ~48.31", got)
	}
}
