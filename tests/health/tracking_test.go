package health_test

import (
	"testing"

	"github.com/aleh11/airtime/internal/health"
)

const trackingSynced = `Reference ID    : C0A80001 (192.168.0.1)
Stratum         : 3
Ref time (UTC)  : Tue Nov 17 11:59:01 2026
System time     : 0.000123456 seconds slow of NTP time
Last offset     : -0.000045678 seconds
RMS offset      : 0.000210000 seconds
Frequency       : 12.345 ppm slow
Residual freq   : -0.001 ppm
Skew            : 0.050 ppm
Root delay      : 0.012345678 seconds
Root dispersion : 0.001234567 seconds
Update interval : 64.5 seconds
Leap status     : Normal
`

// What chrony prints right after boot, before its first clock update.
const trackingUnsynced = `Reference ID    : 00000000 ()
Stratum         : 0
Ref time (UTC)  : Thu Jan 01 00:00:00 1970
System time     : 0.000000000 seconds fast of NTP time
Last offset     : +0.000000000 seconds
RMS offset      : 0.000000000 seconds
Frequency       : 0.000 ppm slow
Residual freq   : +0.000 ppm
Skew            : 0.000 ppm
Root delay      : 1.000000000 seconds
Root dispersion : 1.000000000 seconds
Update interval : 0.0 seconds
Leap status     : Not synchronised
`

func TestParseChronyTrackingSynced(t *testing.T) {
	got := health.ParseChronyTracking(trackingSynced)
	if !got.Synced {
		t.Fatal("Leap status Normal should count as synced")
	}
	if got.OffsetSeconds != -0.000123456 {
		t.Fatalf("offset = %v, want -0.000123456 (slow is negative)", got.OffsetSeconds)
	}
}

func TestParseChronyTrackingFastOffsetIsPositive(t *testing.T) {
	out := "System time     : 2.5 seconds fast of NTP time\nLeap status     : Normal\n"
	if got := health.ParseChronyTracking(out); got.OffsetSeconds != 2.5 {
		t.Fatalf("offset = %v, want 2.5", got.OffsetSeconds)
	}
}

func TestParseChronyTrackingLeapSecondDayIsStillSynced(t *testing.T) {
	for _, status := range []string{"Insert second", "Delete second"} {
		if !health.ParseChronyTracking("Leap status     : " + status + "\n").Synced {
			t.Errorf("%q should count as synced", status)
		}
	}
}

func TestParseChronyTrackingNotSynchronised(t *testing.T) {
	if health.ParseChronyTracking(trackingUnsynced).Synced {
		t.Fatal("Not synchronised must not be trusted")
	}
}

func TestParseChronyTrackingUnreadableIsNotTrusted(t *testing.T) {
	for name, out := range map[string]string{
		"empty":   "",
		"garbled": "506 Cannot talk to daemon\n",
		"no leap": "System time     : 0.1 seconds fast of NTP time\n",
	} {
		if health.ParseChronyTracking(out).Synced {
			t.Errorf("%s: unexpectedly trusted", name)
		}
	}
}
