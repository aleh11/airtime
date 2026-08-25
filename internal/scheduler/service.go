package scheduler

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/aleh11/airtime/internal/store"
)

// Ticks are aligned to the wall clock rather than to daemon start, because a
// schedule names a minute and cron fired exactly on it. An unaligned ticker
// fires up to a full interval late, which reads as the schedule being wrong.
const tickInterval = 30 * time.Second

// maxCatchUp bounds how much missed time is worth acting on. A Raspberry Pi has
// no real-time clock, so it boots with a stale time and jumps forward when
// chrony syncs; without this bound that jump reads as downtime and every
// schedule fires at once.
const maxCatchUp = 10 * time.Minute

// Broadcaster starts the transmitter for a due schedule and records it, so a
// scheduled broadcast appears on the dashboard exactly like a manual one.
type Broadcaster interface {
	StartCommand(command string) error
}

// Service fires schedules from the database. The last checked time is persisted
// so a schedule missed while the daemon was down still fires once on return.
type Service struct {
	store  *store.Store
	runner Broadcaster
	log    *slog.Logger
}

func NewService(s *store.Store, runner Broadcaster) *Service {
	return &Service{store: s, runner: runner, log: slog.Default()}
}

func (s *Service) Run(ctx context.Context) {
	s.Tick(time.Now())
	for {
		now := time.Now()
		timer := time.NewTimer(NextTick(now).Sub(now))
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case tick := <-timer.C:
			s.Tick(tick)
		}
	}
}

// NextTick is the first wall-clock tick boundary strictly after now.
func NextTick(now time.Time) time.Time {
	return now.Truncate(tickInterval).Add(tickInterval)
}

func (s *Service) Tick(now time.Time) {
	last, ok := s.lastChecked()
	s.setLastChecked(now)
	if !ok {
		return
	}

	if now.Before(last) {
		s.log.Info("clock moved backwards; skipping catch-up", "from", last, "to", now)
		return
	}
	if now.Sub(last) > maxCatchUp {
		s.log.Info("gap too large to catch up; resuming from now", "gap", now.Sub(last).Round(time.Second))
		return
	}

	if paused, _, _ := s.store.Setting("app_config", "time_tester_active"); paused == "true" {
		return
	}

	schedules, err := s.store.Schedules()
	if err != nil {
		s.log.Error("read schedules", "error", err)
		return
	}

	due, err := Due(schedules, last, now)
	if err != nil {
		s.log.Error("evaluate schedules", "error", err)
	}

	for _, sc := range due {
		if strings.TrimSpace(sc.Command) == "" {
			continue
		}
		if err := s.runner.StartCommand(sc.Command); err != nil {
			s.log.Error("start scheduled broadcast", "schedule", sc.ID, "error", err)
			continue
		}
		s.log.Info("scheduled broadcast started", "schedule", sc.ID)
	}
}

func (s *Service) lastChecked() (time.Time, bool) {
	var stamp string
	found, err := s.store.Status("scheduler", "last_checked", &stamp)
	if err != nil || !found {
		return time.Time{}, false
	}
	parsed, err := time.Parse(time.RFC3339, stamp)
	if err != nil {
		return time.Time{}, false
	}
	return parsed, true
}

func (s *Service) setLastChecked(now time.Time) {
	if err := s.store.SetStatus("scheduler", "last_checked", now.Format(time.RFC3339)); err != nil {
		s.log.Error("record scheduler tick", "error", err)
	}
}
