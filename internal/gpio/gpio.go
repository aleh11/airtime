package gpio

import "errors"

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
