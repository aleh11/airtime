//go:build linux

package gpio

import (
	"fmt"
	"sync"
	"time"

	"github.com/warthog618/go-gpiocdev"
)

const buttonDebounce = 10 * time.Millisecond

// HoldDuration is how long the button must be held for the stealth toggle,
// matching the hat's original behaviour.
const HoldDuration = 3 * time.Second

type lines struct {
	leds   map[LED]*gpiocdev.Line
	button *gpiocdev.Line
}

// The Controller must outlive the LEDs: the kernel frees a line when its fd closes.
func Open(chip string, pins Pins, buttons Buttons) (Controller, error) {
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

	// Both edges: a hold is only distinguishable from a press by timing it.
	var (
		mu        sync.Mutex
		holdTimer *time.Timer
		held      bool
	)
	button, err := gpiocdev.RequestLine(chip, pins.Button,
		gpiocdev.AsInput,
		gpiocdev.WithPullUp,
		gpiocdev.WithDebounce(buttonDebounce),
		gpiocdev.WithBothEdges,
		gpiocdev.WithConsumer("airtime"),
		gpiocdev.WithEventHandler(func(event gpiocdev.LineEvent) {
			mu.Lock()
			defer mu.Unlock()

			if event.Type == gpiocdev.LineEventFallingEdge {
				held = false
				holdTimer = time.AfterFunc(HoldDuration, func() {
					mu.Lock()
					held = true
					mu.Unlock()
					if buttons.OnHold != nil {
						buttons.OnHold()
					}
				})
				return
			}

			if holdTimer != nil {
				holdTimer.Stop()
				holdTimer = nil
			}
			if !held && buttons.OnPress != nil {
				buttons.OnPress()
			}
			held = false
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
