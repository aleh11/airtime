package transmit_test

import (
	"testing"

	"github.com/aleh11/airtime/internal/gpio"
	"github.com/aleh11/airtime/internal/transmit"
)

func TestValidateOffsetMatchesTheDashboardLimit(t *testing.T) {
	for _, valid := range []int{0, 720, -720, 60} {
		if _, err := transmit.ValidateOffset(valid); err != nil {
			t.Fatalf("ValidateOffset(%d) rejected a usable offset: %v", valid, err)
		}
	}
	for _, invalid := range []int{721, -721, 1440} {
		if _, err := transmit.ValidateOffset(invalid); err == nil {
			t.Fatalf("ValidateOffset(%d) accepted an offset beyond twelve hours", invalid)
		}
	}
}

func TestValidateDurationStopsAtTwelveHours(t *testing.T) {
	// The dashboard has always rejected more than 720 minutes.
	if _, err := transmit.ValidateDuration(720); err != nil {
		t.Fatalf("720 minutes rejected: %v", err)
	}
	if _, err := transmit.ValidateDuration(721); err == nil {
		t.Fatal("721 minutes accepted, want the twelve hour limit enforced")
	}
}

func TestStartupAnimationLeavesEveryLedOff(t *testing.T) {
	fake := gpio.NewFake()
	gpio.StartupAnimation(fake)
	for _, led := range []gpio.LED{gpio.Heartbeat, gpio.NTP, gpio.Antenna} {
		if fake.IsOn(led) {
			t.Fatalf("%s still lit after the sweep; the monitor takes over from dark", led)
		}
	}
}
