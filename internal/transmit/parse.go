package transmit

import (
	"regexp"
	"strconv"
	"strings"
)

var (
	standardFlag = regexp.MustCompile(`-s\s+(\w+)`)
	durationFlag = regexp.MustCompile(`-r\s+(\d+)`)
	offsetFlag   = regexp.MustCompile(`-z\s+(-?\d+)`)
	fixedFlag    = regexp.MustCompile(`-t\s+"?\S+\s+(\d{1,2}:\d{2})`)
)

// Parse recovers a Request from a stored command line, so a schedule can be
// reported the same way a manually started broadcast is.
func Parse(command string) Request {
	req := Request{TimeMode: "time_now"}

	if match := standardFlag.FindStringSubmatch(command); match != nil {
		req.Standard = match[1]
	}
	if match := durationFlag.FindStringSubmatch(command); match != nil {
		req.DurationMinutes, _ = strconv.Atoi(match[1])
	}
	if match := offsetFlag.FindStringSubmatch(command); match != nil {
		req.Offset, _ = strconv.Atoi(match[1])
		req.OffsetEnabled = true
	}
	if match := fixedFlag.FindStringSubmatch(command); match != nil {
		req.TimeMode = "fixed_time"
		req.FixedTime = strings.TrimSuffix(match[1], `"`)
	}

	return req
}
