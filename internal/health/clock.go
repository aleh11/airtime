package health

import (
	"context"
	"os/exec"
	"time"
)

const trackingTimeout = 3 * time.Second

// ClockTrusted reports whether chrony has corrected the system clock. The Pi
// has no RTC, so until then the clock may be hours or days out, and
// broadcasting it would set every radio clock in range to the wrong time.
//
// This is deliberately not NTP.Synced from ParseChronySources, which is true
// as soon as any source has replied, before the clock has been stepped.
func ClockTrusted(ctx context.Context) bool {
	ctx, cancel := context.WithTimeout(ctx, trackingTimeout)
	defer cancel()
	output, err := exec.CommandContext(ctx, "chronyc", "-n", "tracking").Output()
	if err != nil {
		return false
	}
	return ParseChronyTracking(string(output)).Synced
}
