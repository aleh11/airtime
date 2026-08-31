package metrics

import (
	"fmt"
	"strconv"
	"strings"
)

type Memory struct {
	Total       uint64
	Available   uint64
	Percent     float64
	SwapPercent float64
}

// ParseMeminfo reads the contents of /proc/meminfo.
func ParseMeminfo(contents string) (Memory, error) {
	fields := map[string]uint64{}
	for _, line := range strings.Split(contents, "\n") {
		name, rest, found := strings.Cut(line, ":")
		if !found {
			continue
		}
		value := strings.Fields(strings.TrimSpace(rest))
		if len(value) == 0 {
			continue
		}
		kb, err := strconv.ParseUint(value[0], 10, 64)
		if err != nil {
			continue
		}
		fields[name] = kb * 1024
	}

	total, ok := fields["MemTotal"]
	if !ok || total == 0 {
		return Memory{}, fmt.Errorf("meminfo has no usable MemTotal")
	}

	mem := Memory{
		Total:     total,
		Available: fields["MemAvailable"],
	}
	mem.Percent = float64(total-mem.Available) / float64(total) * 100

	if swapTotal := fields["SwapTotal"]; swapTotal > 0 {
		swapUsed := swapTotal - fields["SwapFree"]
		mem.SwapPercent = float64(swapUsed) / float64(swapTotal) * 100
	}

	return mem, nil
}

// CPUTimes is one reading of the jiffy counters for a CPU.
type CPUTimes struct {
	Busy uint64
	Idle uint64
}

type Stat struct {
	Total   CPUTimes
	PerCore []CPUTimes
}

// ParseStat reads the contents of /proc/stat.
func ParseStat(contents string) (Stat, error) {
	var stat Stat
	found := false

	for _, line := range strings.Split(contents, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 5 || !strings.HasPrefix(fields[0], "cpu") {
			continue
		}

		var times CPUTimes
		for i, raw := range fields[1:] {
			value, err := strconv.ParseUint(raw, 10, 64)
			if err != nil {
				return Stat{}, fmt.Errorf("stat has an unreadable counter %q: %w", raw, err)
			}
			// Columns 4 and 5 are idle and iowait; everything else is work.
			if i == 3 || i == 4 {
				times.Idle += value
			} else {
				times.Busy += value
			}
		}

		if fields[0] == "cpu" {
			stat.Total = times
			found = true
		} else {
			stat.PerCore = append(stat.PerCore, times)
		}
	}

	if !found {
		return Stat{}, fmt.Errorf("stat has no aggregate cpu line")
	}
	return stat, nil
}

// CPUPercent reports busy time between two readings.
func CPUPercent(before, after CPUTimes) float64 {
	busy := float64(after.Busy) - float64(before.Busy)
	idle := float64(after.Idle) - float64(before.Idle)
	elapsed := busy + idle
	if elapsed <= 0 {
		return 0
	}
	return busy / elapsed * 100
}

func PerCorePercent(before, after []CPUTimes) []float64 {
	count := min(len(before), len(after))
	out := make([]float64, count)
	for i := range count {
		out[i] = CPUPercent(before[i], after[i])
	}
	return out
}

// ParseTemperature reads a thermal zone reading in millidegrees.
func ParseTemperature(contents string) (float64, error) {
	milli, err := strconv.ParseFloat(strings.TrimSpace(contents), 64)
	if err != nil {
		return 0, fmt.Errorf("unreadable thermal zone value: %w", err)
	}
	return milli / 1000, nil
}
