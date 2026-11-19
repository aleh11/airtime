package health

import "time"

const (
	// ConfirmDuration is three quick blinks: the hat's answer to a double press.
	ConfirmDuration = 600 * time.Millisecond
	confirmHalf     = 100 * time.Millisecond
	// A slow, even blink while Always On waits for the clock, so it reads
	// differently from both solid (on air) and dark (off).
	waitingHalf  = time.Second
	waitingState = "waiting_for_sync"
	stateRefresh = time.Second
)

// AntennaState decides the antenna LED. A confirmation blink wins over
// everything, then the waiting blink, then whether anything is on air.
func AntennaState(now time.Time, transmitting, waiting bool, confirmUntil time.Time) bool {
	if now.Before(confirmUntil) {
		left := confirmUntil.Sub(now)
		return (left/confirmHalf)%2 == 1
	}
	if waiting && !transmitting {
		return (now.UnixNano()/int64(waitingHalf))%2 == 0
	}
	return transmitting
}
