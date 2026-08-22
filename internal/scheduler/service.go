package scheduler

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/aleh11/airtime/internal/store"
)

const tickInterval = 30 * time.Second

// Runner starts the transmitter for a due schedule.
type Runner interface {
	Start(args []string) error
	Stop()
	Running() bool
}

// Service fires schedules from the database. The last checked time is persisted
// so a schedule missed while the daemon was down still fires once on return.
type Service struct {
	store  *store.Store
	runner Runner
	log    *slog.Logger
}

func NewService(s *store.Store, runner Runner) *Service {
	return &Service{store: s, runner: runner, log: slog.Default()}
}

func (s *Service) Run(ctx context.Context) {
	ticker := time.NewTicker(tickInterval)
	defer ticker.Stop()

	s.Tick(time.Now())
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			s.Tick(now)
		}
	}
}

func (s *Service) Tick(now time.Time) {
	last, ok := s.lastChecked()
	s.setLastChecked(now)
	if !ok {
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
		args := strings.Fields(sc.Command)
		if len(args) == 0 {
			continue
		}
		if err := s.runner.Start(args); err != nil {
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
