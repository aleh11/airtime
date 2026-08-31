package gpio

import (
	"errors"
	"time"
)

var ErrUnsupported = errors.New("gpio is only available on linux")

type LED string

const (
	Heartbeat LED = "heartbeat"
	NTP       LED = "ntp"
	Antenna   LED = "antenna"
)

// Pins maps each LED and the control button to a line offset on the chip.
type Pins struct {
	Heartbeat int
	NTP       int
	Antenna   int
	Button    int
}

// DefaultPins matches the AirTime Pi Hat.
var DefaultPins = Pins{Heartbeat: 9, NTP: 11, Antenna: 5, Button: 19}

// Buttons are the two actions the hat's single button carries: a press toggles
// the broadcast, and a hold toggles stealth mode.
type Buttons struct {
	OnPress func()
	OnHold  func()
}

type Controller interface {
	Set(led LED, on bool) error
	Close() error
}

// Fake records LED state in memory so the daemon runs on a development machine.
type Fake struct {
	state map[LED]bool
}

func NewFake() *Fake { return &Fake{state: map[LED]bool{}} }

func (f *Fake) Set(led LED, on bool) error {
	f.state[led] = on
	return nil
}

func (f *Fake) IsOn(led LED) bool { return f.state[led] }

func (f *Fake) Close() error { return nil }

// StartupAnimation sweeps the three LEDs three times, as the hat has always
// done on boot. It is the only sign a user gets that the daemon came back after
// a reboot or an update, so it survived the port on purpose.
func StartupAnimation(c Controller) {
	if c == nil {
		return
	}
	order := []LED{Heartbeat, NTP, Antenna}
	for sweep := 0; sweep < 3; sweep++ {
		for _, led := range order {
			c.Set(led, false)
		}
		time.Sleep(100 * time.Millisecond)

		for _, led := range order {
			c.Set(led, true)
			if led == Antenna {
				time.Sleep(200 * time.Millisecond)
				continue
			}
			time.Sleep(100 * time.Millisecond)
		}
	}
	for _, led := range order {
		c.Set(led, false)
	}
}
