package scheduler_test

import (
	"testing"

	"github.com/aleh11/airtime/internal/scheduler"
)

func TestSpecFromFriendly(t *testing.T) {
	cases := []struct {
		time, frequency, want string
	}{
		{"14:30", "daily", "30 14 * * *"},
		{"14:30", "weekly", "30 14 * * 0"},
		{"14:30", "monthly", "30 14 1 * *"},
		{"09:05", "daily", "5 9 * * *"},
	}
	for _, tc := range cases {
		got, err := scheduler.SpecFrom(tc.time, tc.frequency)
		if err != nil {
			t.Fatalf("%s/%s: %v", tc.time, tc.frequency, err)
		}
		if got != tc.want {
			t.Fatalf("%s/%s: got %q, want %q", tc.time, tc.frequency, got, tc.want)
		}
	}
}

func TestSpecFromRejectsBadTimes(t *testing.T) {
	for _, bad := range []string{"25:00", "12:60", "noon", "", "12"} {
		if _, err := scheduler.SpecFrom(bad, "daily"); err == nil {
			t.Fatalf("%q accepted", bad)
		}
	}
}

func TestFriendlyFromSpec(t *testing.T) {
	cases := []struct {
		spec, time, frequency string
	}{
		{"30 14 * * *", "14:30", "daily"},
		{"0 6 * * 0", "06:00", "weekly"},
		{"0 6 1 * *", "06:00", "monthly"},
		{"*/5 * * * *", "**:*/5", "custom"},
		{"nonsense", "00:00", "custom"},
	}
	for _, tc := range cases {
		gotTime, gotFreq := scheduler.FriendlyFrom(tc.spec)
		if gotFreq != tc.frequency {
			t.Fatalf("%q: got frequency %q, want %q", tc.spec, gotFreq, tc.frequency)
		}
		if tc.frequency != "custom" && gotTime != tc.time {
			t.Fatalf("%q: got time %q, want %q", tc.spec, gotTime, tc.time)
		}
	}
}
