package transmit

import (
	"fmt"
	"os/exec"
	"sync"
	"time"
)

// Running is consulted on every LED tick, so the pgrep behind it must be cached.
const strayPollInterval = 2 * time.Second

// Runner owns the txtempus child process.
type Runner struct {
	mu      sync.Mutex
	cmd     *exec.Cmd
	onExit  func(err error)
	started bool

	strayAt      time.Time
	strayRunning bool
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
	r.stopLocked()
	r.mu.Unlock()

	// A stray txtempus is still on the air and nothing else can silence it.
	_ = exec.Command("pkill", "-x", "txtempus").Run()

	r.mu.Lock()
	r.strayRunning = false
	r.strayAt = time.Now()
	r.mu.Unlock()
}

func (r *Runner) stopLocked() {
	if r.cmd == nil || r.cmd.Process == nil {
		return
	}
	_ = r.cmd.Process.Kill()
	r.cmd = nil
	r.started = false
}

// Includes a txtempus this daemon did not start, which would otherwise go unreported.
func (r *Runner) Running() bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.started {
		return true
	}

	if time.Since(r.strayAt) >= strayPollInterval {
		r.strayRunning = exec.Command("pgrep", "-x", "txtempus").Run() == nil
		r.strayAt = time.Now()
	}
	return r.strayRunning
}
