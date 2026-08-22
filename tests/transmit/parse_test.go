package transmit_test

import (
	"testing"

	"github.com/aleh11/airtime/internal/transmit"
)

func TestParseRecoversAStoredCommand(t *testing.T) {
	got := transmit.Parse("/usr/bin/txtempus -s DCF77 -r 360 -z 59")

	if got.Standard != "DCF77" {
		t.Fatalf("standard: got %q", got.Standard)
	}
	if got.DurationMinutes != 360 {
		t.Fatalf("duration: got %d", got.DurationMinutes)
	}
	if got.Offset != 59 || !got.OffsetEnabled {
		t.Fatalf("offset: got %d enabled=%v", got.Offset, got.OffsetEnabled)
	}
}

func TestParseHandlesFixedTime(t *testing.T) {
	got := transmit.Parse(`/usr/bin/txtempus -s JJY60 -r 15 -t "2026-08-22 09:30"`)

	if got.Standard != "JJY60" || got.DurationMinutes != 15 {
		t.Fatalf("got %+v", got)
	}
	if got.TimeMode != "fixed_time" || got.FixedTime != "09:30" {
		t.Fatalf("time mode: got %q %q", got.TimeMode, got.FixedTime)
	}
}

func TestParseWithoutOptionalFlags(t *testing.T) {
	got := transmit.Parse("/usr/bin/txtempus -s MSF -r 10")

	if got.Offset != 0 || got.OffsetEnabled {
		t.Fatalf("offset should be absent: got %+v", got)
	}
	if got.TimeMode != "time_now" {
		t.Fatalf("time mode: got %q", got.TimeMode)
	}
}

func TestParseRoundTripsWithCommand(t *testing.T) {
	original := transmit.Request{
		Standard: "WWVB", DurationMinutes: 30,
		TimeMode: "time_now", Offset: -45, OffsetEnabled: true,
	}
	rendered := transmit.Command(original, noon)

	got := transmit.Parse(joinArgs(rendered))
	if got.Standard != original.Standard || got.DurationMinutes != original.DurationMinutes || got.Offset != original.Offset {
		t.Fatalf("got %+v, want %+v", got, original)
	}
}

func joinArgs(args []string) string {
	out := ""
	for i, arg := range args {
		if i > 0 {
			out += " "
		}
		out += arg
	}
	return out
}
