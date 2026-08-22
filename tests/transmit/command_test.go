package transmit_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/aleh11/airtime/internal/transmit"
)

var noon = time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)

func TestCommandForCurrentTime(t *testing.T) {
	got := transmit.Command(transmit.Request{Standard: "DCF77", DurationMinutes: 30, TimeMode: "time_now"}, noon)
	want := []string{"/usr/bin/txtempus", "-s", "DCF77", "-r", "30"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestCommandAppliesOffsetWhenEnabled(t *testing.T) {
	got := transmit.Command(transmit.Request{
		Standard: "WWVB", DurationMinutes: 10,
		TimeMode: "time_now", Offset: -60, OffsetEnabled: true,
	}, noon)
	want := []string{"/usr/bin/txtempus", "-s", "WWVB", "-r", "10", "-z", "-60"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestCommandIgnoresZeroOffset(t *testing.T) {
	got := transmit.Command(transmit.Request{
		Standard: "MSF", DurationMinutes: 5,
		TimeMode: "time_now", Offset: 0, OffsetEnabled: true,
	}, noon)
	want := []string{"/usr/bin/txtempus", "-s", "MSF", "-r", "5"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestCommandForFixedTimeUsesTodaysDate(t *testing.T) {
	got := transmit.Command(transmit.Request{
		Standard: "JJY40", DurationMinutes: 15,
		TimeMode: "fixed_time", FixedTime: "09:30",
	}, noon)
	want := []string{"/usr/bin/txtempus", "-s", "JJY40", "-r", "15", "-t", "2026-08-22 09:30"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestFixedTimeModeWithoutATimeFallsBackToNow(t *testing.T) {
	got := transmit.Command(transmit.Request{
		Standard: "DCF77", DurationMinutes: 15,
		TimeMode: "fixed_time", FixedTime: "",
	}, noon)
	want := []string{"/usr/bin/txtempus", "-s", "DCF77", "-r", "15"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestOffsetModeAppliesEvenWhenFlagIsOff(t *testing.T) {
	got := transmit.Command(transmit.Request{
		Standard: "DCF77", DurationMinutes: 20,
		TimeMode: "time_now_with_offset", Offset: 45, OffsetEnabled: false,
	}, noon)
	want := []string{"/usr/bin/txtempus", "-s", "DCF77", "-r", "20", "-z", "45"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestValidStandards(t *testing.T) {
	for _, standard := range []string{"DCF77", "WWVB", "MSF", "JJY40", "JJY60"} {
		if err := transmit.ValidateStandard(standard); err != nil {
			t.Fatalf("%s rejected: %v", standard, err)
		}
	}
	if err := transmit.ValidateStandard("; rm -rf /"); err == nil {
		t.Fatal("injection payload accepted as a signal standard")
	}
}

func TestValidateDurationBounds(t *testing.T) {
	if _, err := transmit.ValidateDuration(0); err == nil {
		t.Fatal("zero duration accepted")
	}
	if _, err := transmit.ValidateDuration(-5); err == nil {
		t.Fatal("negative duration accepted")
	}
	got, err := transmit.ValidateDuration(30)
	if err != nil || got != 30 {
		t.Fatalf("got %d, %v; want 30, nil", got, err)
	}
}
