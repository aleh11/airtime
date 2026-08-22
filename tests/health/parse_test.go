package health_test

import (
	"testing"

	"github.com/aleh11/airtime/internal/health"
)

const sourcesSample = `MS Name/IP address         Stratum Poll Reach LastRx Last sample
===============================================================================
^* 162.159.200.1                 3   6   377    31   +12us[  +14us] +/-   11ms
^- 85.199.214.100                1   6   377   999   -1ms[  -1ms] +/-   22ms
`

func TestNTPPicksTheMostRecentlyHeardSource(t *testing.T) {
	got := health.ParseChronySources(sourcesSample)

	if !got.Synced {
		t.Fatal("got not synced, want synced")
	}
	if got.Server != "162.159.200.1" {
		t.Fatalf("got %q, want the freshest source", got.Server)
	}
	if got.LastRxSeconds != 31 {
		t.Fatalf("got %v, want 31", got.LastRxSeconds)
	}
	// 31s falls in the 20-40 band.
	if got.Score != 0.5 {
		t.Fatalf("got score %v, want 0.5", got.Score)
	}
}

func TestNTPWithNoUsableSources(t *testing.T) {
	got := health.ParseChronySources("MS Name/IP address\n====\n")
	if got.Synced {
		t.Fatalf("got %+v, want not synced", got)
	}
	if got.Score != 0 {
		t.Fatalf("got score %v, want 0", got.Score)
	}
}

func TestNTPScoreBands(t *testing.T) {
	cases := []struct {
		lastRx float64
		want   float64
	}{{10, 0.1}, {30, 0.5}, {50, 1.0}, {80, 3.0}, {300, 5.0}, {600, 10.0}, {2000, 0}}
	for _, tc := range cases {
		if got := health.NTPScore(tc.lastRx); got != tc.want {
			t.Fatalf("lastRx %v: got %v, want %v", tc.lastRx, got, tc.want)
		}
	}
}

func TestPingLatencyIsRead(t *testing.T) {
	const output = `PING 1.1.1.1 (1.1.1.1) 56(84) bytes of data.
64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=14.2 ms

--- 1.1.1.1 ping statistics ---
1 packets transmitted, 1 received, 0% packet loss, time 0ms
rtt min/avg/max/mdev = 14.234/14.234/14.234/0.000 ms
`
	got := health.ParsePing(output)
	if !got.Connected {
		t.Fatal("got disconnected, want connected")
	}
	if got.LatencyMS < 14.1 || got.LatencyMS > 14.3 {
		t.Fatalf("got %v, want ~14.2", got.LatencyMS)
	}
	if got.Score != 0.1 {
		t.Fatalf("got score %v, want 0.1", got.Score)
	}
}

func TestPingWithNoReply(t *testing.T) {
	got := health.ParsePing("1 packets transmitted, 0 received, 100% packet loss\n")
	if got.Connected {
		t.Fatalf("got %+v, want disconnected", got)
	}
}
