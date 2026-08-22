package transmit

import (
	"fmt"
	"os/exec"
	"sync"
)

// Runner owns the txtempus child process. The daemon supervises it directly
// rather than pkill-ing by name, so a transmission started by one code path can
// always be stopped by another.
type Runner struct {
	mu      sync.Mutex
	cmd     *exec.Cmd
	onExit  func(err error)
	started bool
}

func NewRunner(onExit func(err error)) *Runner {
	return &Runner{onExit: onExit}
}

func (r *Runner) Start(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("no command to run")
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	r.stopLocked()

	cmd := exec.Command(args[0], args[1:]...)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start txtempus: %w", err)
	}
	r.cmd = cmd
	r.started = true

	go func() {
		err := cmd.Wait()
		r.mu.Lock()
		if r.cmd == cmd {
			r.cmd = nil
			r.started = false
		}
		r.mu.Unlock()
		if r.onExit != nil {
			r.onExit(err)
		}
	}()

	return nil
}

func (r *Runner) Stop() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.stopLocked()
}

func (r *Runner) stopLocked() {
	if r.cmd == nil || r.cmd.Process == nil {
		return
	}
	_ = r.cmd.Process.Kill()
	r.cmd = nil
	r.started = false
}

func (r *Runner) Running() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.started
}
