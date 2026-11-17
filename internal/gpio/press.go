package gpio

import (
	"sync"
	"time"
)

// DoublePressWindow is how long after a press a second one counts as a
// double press. A single press therefore acts this much later.
const DoublePressWindow = 600 * time.Millisecond

// Presses tells single presses from double presses. Without an OnDoublePress
// handler it passes every press straight through, with no delay.
type Presses struct {
	OnPress       func()
	OnDoublePress func()
	// AfterFunc is time.AfterFunc; tests replace it.
	AfterFunc func(time.Duration, func()) Timer

	mu      sync.Mutex
	pending Timer
}

// Timer is the part of *time.Timer Presses uses.
type Timer interface{ Stop() bool }

// Press records one completed press (not a hold).
func (p *Presses) Press() {
	if p.OnDoublePress == nil {
		if p.OnPress != nil {
			p.OnPress()
		}
		return
	}

	p.mu.Lock()
	if p.pending != nil && p.pending.Stop() {
		p.pending = nil
		p.mu.Unlock()
		p.OnDoublePress()
		return
	}
	after := p.AfterFunc
	if after == nil {
		after = func(d time.Duration, f func()) Timer { return time.AfterFunc(d, f) }
	}
	var timer Timer
	timer = after(DoublePressWindow, func() {
		p.mu.Lock()
		if p.pending != timer {
			p.mu.Unlock()
			return
		}
		p.pending = nil
		p.mu.Unlock()
		if p.OnPress != nil {
			p.OnPress()
		}
	})
	p.pending = timer
	p.mu.Unlock()
}
