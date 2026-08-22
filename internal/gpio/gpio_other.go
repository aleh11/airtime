//go:build !linux

package gpio

func Open(chip string, pins Pins, onButton func()) (Controller, error) {
	return nil, ErrUnsupported
}
