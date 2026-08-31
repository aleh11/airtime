//go:build !linux

package gpio

func Open(chip string, pins Pins, buttons Buttons) (Controller, error) {
	return nil, ErrUnsupported
}
