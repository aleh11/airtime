package health

import (
	"regexp"
	"strconv"
	"strings"
)

type NTP struct {
	Synced        bool
	Score         float64
	LastRxSeconds float64
	Server        string
}

type Ping struct {
	Connected bool
	Score     float64
	LatencyMS float64
}

type band struct {
	upTo  float64
	score float64
}

var ntpBands = []band{{20, 0.1}, {40, 0.5}, {60, 1.0}, {100, 3.0}, {512, 5.0}, {1024, 10.0}}

var pingBands = []band{{40, 0.1}, {80, 0.5}, {120, 1.0}, {280, 3.0}, {750, 5.0}, {5000, 10.0}}

func score(value float64, bands []band) float64 {
	for _, b := range bands {
		if value <= b.upTo {
			return b.score
		}
	}
	return 0
}

func NTPScore(lastRxSeconds float64) float64 { return score(lastRxSeconds, ntpBands) }

func PingScore(latencyMS float64) float64 {
	if latencyMS == 0 {
		return 0
	}
	return score(latencyMS, pingBands)
}

// ParseChronySources reads `chronyc -n sources` and reports the source heard
// from most recently.
func ParseChronySources(output string) NTP {
	lines := strings.Split(strings.TrimSpace(output), "\n")
	if len(lines) < 3 {
		return NTP{LastRxSeconds: 9999, Server: "unknown"}
	}

	best := NTP{LastRxSeconds: 9999, Server: "unknown"}
	found := false

	for _, line := range lines[2:] {
		fields := strings.Fields(line)
		if len(fields) < 6 {
			continue
		}
		lastRx, err := strconv.ParseFloat(fields[5], 64)
		if err != nil {
			continue
		}
		if !found || lastRx < best.LastRxSeconds {
			best = NTP{Synced: true, LastRxSeconds: lastRx, Server: fields[1]}
			found = true
		}
	}

	if !found {
		return NTP{LastRxSeconds: 9999, Server: "unknown"}
	}
	best.Score = NTPScore(best.LastRxSeconds)
	return best
}

var pingTime = regexp.MustCompile(`time=([\d.]+)\s*ms`)

func ParsePing(output string) Ping {
	match := pingTime.FindStringSubmatch(output)
	if match == nil {
		return Ping{}
	}
	latency, err := strconv.ParseFloat(match[1], 64)
	if err != nil {
		return Ping{}
	}
	return Ping{Connected: true, Score: PingScore(latency), LatencyMS: latency}
}
