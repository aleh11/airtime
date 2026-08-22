package metrics

import (
	"fmt"
	"os"
	"sync"
	"syscall"
)

type Disk struct {
	Total   uint64  `json:"total"`
	Used    uint64  `json:"used"`
	Percent float64 `json:"percent"`
}

type CPU struct {
	Percent float64   `json:"percent"`
	PerCore []float64 `json:"per_core"`
	LoadAvg []float64 `json:"load_avg"`
}

type Snapshot struct {
	CPU         CPU        `json:"cpu"`
	Memory      MemoryJSON `json:"memory"`
	Disk        Disk       `json:"disk"`
	Temperature float64    `json:"temperature"`
	Uptime      float64    `json:"uptime"`
}

type MemoryJSON struct {
	Total       uint64  `json:"total"`
	Available   uint64  `json:"available"`
	Percent     float64 `json:"percent"`
	SwapPercent float64 `json:"swap_percent"`
}

// Collector samples the kernel's counters, keeping the previous CPU reading so
// utilisation can be reported over the interval between polls.
type Collector struct {
	mu       sync.Mutex
	previous *Stat
}

func NewCollector() *Collector { return &Collector{} }

func (c *Collector) Snapshot() Snapshot {
	var snap Snapshot

	if contents, err := os.ReadFile("/proc/meminfo"); err == nil {
		if mem, err := ParseMeminfo(string(contents)); err == nil {
			snap.Memory = MemoryJSON{
				Total:       mem.Total,
				Available:   mem.Available,
				Percent:     mem.Percent,
				SwapPercent: mem.SwapPercent,
			}
		}
	}

	if contents, err := os.ReadFile("/proc/stat"); err == nil {
		if current, err := ParseStat(string(contents)); err == nil {
			c.mu.Lock()
			if c.previous != nil {
				snap.CPU.Percent = CPUPercent(c.previous.Total, current.Total)
				snap.CPU.PerCore = PerCorePercent(c.previous.PerCore, current.PerCore)
			}
			c.previous = &current
			c.mu.Unlock()
		}
	}
	if snap.CPU.PerCore == nil {
		snap.CPU.PerCore = []float64{}
	}
	snap.CPU.LoadAvg = loadAverage()

	if contents, err := os.ReadFile("/sys/class/thermal/thermal_zone0/temp"); err == nil {
		if temp, err := ParseTemperature(string(contents)); err == nil {
			snap.Temperature = temp
		}
	}

	var fs syscall.Statfs_t
	if err := syscall.Statfs("/", &fs); err == nil {
		total := fs.Blocks * uint64(fs.Bsize)
		free := fs.Bavail * uint64(fs.Bsize)
		snap.Disk.Total = total
		snap.Disk.Used = total - free
		if total > 0 {
			snap.Disk.Percent = float64(snap.Disk.Used) / float64(total) * 100
		}
	}

	snap.Uptime = uptime()
	return snap
}

func uptime() float64 {
	contents, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0
	}
	var seconds float64
	if _, err := fmt.Sscan(string(contents), &seconds); err != nil {
		return 0
	}
	return seconds
}

func loadAverage() []float64 {
	contents, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return []float64{0, 0, 0}
	}
	load := []float64{0, 0, 0}
	if _, err := fmt.Sscan(string(contents), &load[0], &load[1], &load[2]); err != nil {
		return []float64{0, 0, 0}
	}
	return load
}
