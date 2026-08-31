package transmit

import (
	"fmt"
	"strconv"
	"time"
)

const BinaryPath = "/usr/bin/txtempus"

// MaxDurationMinutes matches the limit the dashboard has always enforced.
const MaxDurationMinutes = 720

// Offsets are a timezone shift in minutes, so twelve hours either way covers
// every real use and rejects a typo that would otherwise reach txtempus.
const MaxOffsetMinutes = 720

// Standards are the signal standards txtempus can encode.
var Standards = []string{"DCF77", "WWVB", "MSF", "JJY40", "JJY60"}

type Request struct {
	Standard        string
	DurationMinutes int
	TimeMode        string
	Offset          int
	OffsetEnabled   bool
	FixedTime       string
}

func ValidateStandard(standard string) error {
	for _, known := range Standards {
		if standard == known {
			return nil
		}
	}
	return fmt.Errorf("unknown signal standard %q", standard)
}

func ValidateOffset(minutes int) (int, error) {
	if minutes < -MaxOffsetMinutes || minutes > MaxOffsetMinutes {
		return 0, fmt.Errorf("offset must be between -%d and %d minutes, got %d", MaxOffsetMinutes, MaxOffsetMinutes, minutes)
	}
	return minutes, nil
}

func ValidateDuration(minutes int) (int, error) {
	if minutes <= 0 {
		return 0, fmt.Errorf("duration must be positive, got %d", minutes)
	}
	if minutes > MaxDurationMinutes {
		return 0, fmt.Errorf("duration must be at most %d minutes, got %d", MaxDurationMinutes, minutes)
	}
	return minutes, nil
}

// Command builds the txtempus invocation for a request. Arguments are passed as
// a slice and never through a shell, so no value here can be interpreted as a
// command by anything downstream.
func Command(req Request, now time.Time) []string {
	args := []string{
		BinaryPath,
		"-s", req.Standard,
		"-r", strconv.Itoa(req.DurationMinutes),
	}

	switch {
	case req.TimeMode == "fixed_time" && req.FixedTime != "":
		args = append(args, "-t", fmt.Sprintf("%s %s", now.Format("2006-01-02"), req.FixedTime))
	case (req.TimeMode == "time_now_with_offset" || req.OffsetEnabled) && req.Offset != 0:
		args = append(args, "-z", strconv.Itoa(req.Offset))
	}

	return args
}
