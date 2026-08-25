package metrics

import (
	"context"
	"fmt"
	"os"
	"sync"
	"syscall"
	"time"
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

// sampleInterval is the window CPU utilisation is measured over. It is fixed
// rather than taken from the gap between requests so that the number means the
// same thing however often, and by however many clients, it is asked for.
const sampleInterval = 2 * time.Second

// Collector samples the kernel's counters on its own cadence. CPU utilisation
// is a rate, so it can only be measured between two readings: deriving it from
// the gap between callers made the figure depend on who asked and when, and
// counted the work of serving that very request against a window as short as
// the round trip.
type Collector struct {
	mu       sync.Mutex
	previous *Stat
	cpu      CPU
}

func NewCollector() *Collector { return &Collector{} }

// Run samples until ctx is cancelled. Without it a Collector reports zero
// utilisation, having never had two readings to compare.
func (c *Collector) Run(ctx context.Context) {
	c.sample()
	// Prime with a short second reading so the first dashboard load has a real
	// figure instead of a zero that looks like a broken sensor.
	timer := time.NewTimer(200 * time.Millisecond)
	select {
	case <-ctx.Done():
		timer.Stop()
		return
	case <-timer.C:
		c.sample()
	}

	ticker := time.NewTicker(sampleInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.sample()
		}
	}
}

func (c *Collector) sample() {
	contents, err := os.ReadFile("/proc/stat")
	if err != nil {
		return
	}
	current, err := ParseStat(string(contents))
	if err != nil {
		return
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if c.previous != nil {
		c.cpu.Percent = CPUPercent(c.previous.Total, current.Total)
		c.cpu.PerCore = PerCorePercent(c.previous.PerCore, current.PerCore)
	}
	c.previous = &current
}

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

	c.mu.Lock()
	snap.CPU.Percent = c.cpu.Percent
	snap.CPU.PerCore = append([]float64(nil), c.cpu.PerCore...)
	c.mu.Unlock()

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
