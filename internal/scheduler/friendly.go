package scheduler

import (
	"fmt"
	"strconv"
	"strings"
)

// SpecFrom converts the dashboard's "23:55" + "daily" into a cron spec.
func SpecFrom(clock, frequency string) (string, error) {
	hourText, minuteText, found := strings.Cut(clock, ":")
	if !found {
		return "", fmt.Errorf("invalid time %q, use HH:MM", clock)
	}

	hour, err := strconv.Atoi(hourText)
	if err != nil || hour < 0 || hour > 23 {
		return "", fmt.Errorf("hour must be 0-23, got %q", hourText)
	}
	minute, err := strconv.Atoi(minuteText)
	if err != nil || minute < 0 || minute > 59 {
		return "", fmt.Errorf("minute must be 0-59, got %q", minuteText)
	}

	switch frequency {
	case "weekly":
		return fmt.Sprintf("%d %d * * 0", minute, hour), nil
	case "monthly":
		return fmt.Sprintf("%d %d 1 * *", minute, hour), nil
	default:
		return fmt.Sprintf("%d %d * * *", minute, hour), nil
	}
}

// FriendlyFrom is the inverse of SpecFrom, for specs the dashboard can express.
func FriendlyFrom(spec string) (clock, frequency string) {
	parts := strings.Fields(spec)
	if len(parts) != 5 {
		return "00:00", "custom"
	}

	minute, hour, dom, month, dow := parts[0], parts[1], parts[2], parts[3], parts[4]
	clock = fmt.Sprintf("%s:%s", pad(hour), pad(minute))

	switch {
	case dom == "*" && month == "*" && dow == "*":
		frequency = "daily"
	case dom == "*" && month == "*" && dow != "*":
		frequency = "weekly"
	case dom != "*" && month == "*":
		frequency = "monthly"
	default:
		frequency = "custom"
	}

	if _, err := strconv.Atoi(hour); err != nil {
		frequency = "custom"
	}
	if _, err := strconv.Atoi(minute); err != nil {
		frequency = "custom"
	}

	return clock, frequency
}

func pad(value string) string {
	if len(value) == 1 {
		return "0" + value
	}
	return value
}
