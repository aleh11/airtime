package health

import "time"

// FlashDuration is how long a blinking LED stays lit. The hat's LEDs carry
// their meaning in the gap between flashes, not in the flash itself.
const FlashDuration = 100 * time.Millisecond

// A short flash separated by Interval, so a better score pulses faster; zero is dark.
type Blinker struct {
	Interval   time.Duration
	on         bool
	lastToggle time.Time
}

// State advances the blink and reports whether the LED should be lit.
func (b *Blinker) State(now time.Time) bool {
	if b.Interval <= 0 {
		b.on = false
		return false
	}

	if b.on {
		if now.Sub(b.lastToggle) >= FlashDuration {
			b.on = false
			b.lastToggle = now
		}
		return b.on
	}

	if now.Sub(b.lastToggle) >= b.Interval {
		b.on = true
		b.lastToggle = now
	}
	return b.on
}

// ScoreInterval converts a health score into a blink gap. The scores are
// already the seconds the original implementation slept between flashes.
func ScoreInterval(score float64) time.Duration {
	if score <= 0 {
		return 0
	}
	return time.Duration(score * float64(time.Second))
}
