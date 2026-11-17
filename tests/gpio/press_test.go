package gpio_test

import (
	"testing"
	"time"

	"github.com/aleh11/airtime/internal/gpio"
)

type fakeTimer struct {
	fire    func()
	stopped bool
	fired   bool
}

func (f *fakeTimer) Stop() bool {
	if f.stopped || f.fired {
		return false
	}
	f.stopped = true
	return true
}

type harness struct {
	presses *gpio.Presses
	timers  []*fakeTimer
	singles int
	doubles int
}

func newHarness(withDouble bool) *harness {
	h := &harness{}
	h.presses = &gpio.Presses{
		OnPress: func() { h.singles++ },
		AfterFunc: func(d time.Duration, f func()) gpio.Timer {
			if d != gpio.DoublePressWindow {
				panic("unexpected window")
			}
			t := &fakeTimer{fire: f}
			h.timers = append(h.timers, t)
			return t
		},
	}
	if withDouble {
		h.presses.OnDoublePress = func() { h.doubles++ }
	}
	return h
}

// elapse fires the most recent timer, as if the window ran out.
func (h *harness) elapse() {
	t := h.timers[len(h.timers)-1]
	if t.stopped || t.fired {
		return
	}
	t.fired = true
	t.fire()
}

func TestPressesPassStraightThroughWithoutADoubleHandler(t *testing.T) {
	h := newHarness(false)
	h.presses.Press()
	if h.singles != 1 || len(h.timers) != 0 {
		t.Fatalf("singles=%d timers=%d, want an immediate press", h.singles, len(h.timers))
	}
}

func TestASinglePressWaitsForTheWindow(t *testing.T) {
	h := newHarness(true)
	h.presses.Press()
	if h.singles != 0 {
		t.Fatal("single press acted before the window closed")
	}
	h.elapse()
	if h.singles != 1 || h.doubles != 0 {
		t.Fatalf("singles=%d doubles=%d, want 1/0", h.singles, h.doubles)
	}
}

func TestTwoPressesInsideTheWindowAreADoublePress(t *testing.T) {
	h := newHarness(true)
	h.presses.Press()
	h.presses.Press()
	h.elapse()
	if h.singles != 0 || h.doubles != 1 {
		t.Fatalf("singles=%d doubles=%d, want 0/1", h.singles, h.doubles)
	}
}

func TestTwoPressesOutsideTheWindowAreTwoSingles(t *testing.T) {
	h := newHarness(true)
	h.presses.Press()
	h.elapse()
	h.presses.Press()
	h.elapse()
	if h.singles != 2 || h.doubles != 0 {
		t.Fatalf("singles=%d doubles=%d, want 2/0", h.singles, h.doubles)
	}
}

func TestThreeQuickPressesAreADoubleThenASingle(t *testing.T) {
	h := newHarness(true)
	h.presses.Press()
	h.presses.Press()
	h.presses.Press()
	h.elapse()
	if h.singles != 1 || h.doubles != 1 {
		t.Fatalf("singles=%d doubles=%d, want 1/1", h.singles, h.doubles)
	}
}
