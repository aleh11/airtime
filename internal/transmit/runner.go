package transmit

import (
	"fmt"
	"os/exec"
	"sync"
	"time"
)

// strayPollInterval bounds how often the runner shells out to look for a
// txtempus it did not start. Running is consulted on every LED tick, so this
// cannot be checked afresh each time.
const strayPollInterval = 2 * time.Second

// Runner owns the txtempus child process. The daemon supervises it directly
// rather than pkill-ing by name, so a transmission started by one code path can
// always be stopped by another.
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

	// A txtempus the daemon did not start is still on the air, and the dashboard
	// offers no other way to silence it. The Python implementation stopped by
	// name for exactly this reason.
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

// Running reports whether anything is transmitting, including a txtempus this
// daemon did not start — one left behind by a crash, or launched by hand. The
// old implementation polled by name, so a stray transmission was visible and
// stoppable; tracking only our own child would leave it on the air with the
// dashboard insisting nothing was happening.
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
