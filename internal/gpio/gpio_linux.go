//go:build linux

package gpio

import (
	"fmt"
	"time"

	"github.com/warthog618/go-gpiocdev"
)

const buttonDebounce = 10 * time.Millisecond

type lines struct {
	leds   map[LED]*gpiocdev.Line
	button *gpiocdev.Line
}

// Open requests every line the hat uses. The returned Controller holds those
// lines for its lifetime, which is what keeps the LEDs lit: the kernel releases
// a line as soon as its owning file descriptor closes.
func Open(chip string, pins Pins, onButton func()) (Controller, error) {
	l := &lines{leds: map[LED]*gpiocdev.Line{}}

	for led, offset := range map[LED]int{Heartbeat: pins.Heartbeat, NTP: pins.NTP, Antenna: pins.Antenna} {
		line, err := gpiocdev.RequestLine(chip, offset,
			gpiocdev.AsOutput(0),
			gpiocdev.WithConsumer("airtime"))
		if err != nil {
			l.Close()
			return nil, fmt.Errorf("request %s led on %s:%d: %w", led, chip, offset, err)
		}
		l.leds[led] = line
	}

	button, err := gpiocdev.RequestLine(chip, pins.Button,
		gpiocdev.AsInput,
		gpiocdev.WithPullUp,
		gpiocdev.WithDebounce(buttonDebounce),
		gpiocdev.WithFallingEdge,
		gpiocdev.WithConsumer("airtime"),
		gpiocdev.WithEventHandler(func(gpiocdev.LineEvent) {
			if onButton != nil {
				onButton()
			}
		}))
	if err != nil {
		l.Close()
		return nil, fmt.Errorf("request button on %s:%d: %w", chip, pins.Button, err)
	}
	l.button = button

	return l, nil
}

func (l *lines) Set(led LED, on bool) error {
	line, ok := l.leds[led]
	if !ok {
		return fmt.Errorf("unknown led %q", led)
	}
	value := 0
	if on {
		value = 1
	}
	if err := line.SetValue(value); err != nil {
		return fmt.Errorf("set %s led: %w", led, err)
	}
	return nil
}

func (l *lines) Close() error {
	for _, line := range l.leds {
		if line != nil {
			line.Close()
		}
	}
	if l.button != nil {
		l.button.Close()
	}
	return nil
}
