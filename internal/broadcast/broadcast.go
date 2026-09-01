// Package broadcast starts, stops and records what is on air.
package broadcast

import (
	"log/slog"
	"strconv"
	"time"

	"github.com/aleh11/airtime/internal/store"
	"github.com/aleh11/airtime/internal/transmit"
)

// Details is what the dashboard is told about the current broadcast.
type Details struct {
	Standard  string `json:"service"`
	Duration  int    `json:"duration"`
	StartedAt string `json:"started_at"`
	Offset    *int   `json:"offset"`
	FixedTime string `json:"fixed_time"`
	IsTester  bool   `json:"is_tester"`
}

// Runner is the process supervisor a Controller drives.
type Runner interface {
	Start(args []string) error
	Stop()
	Running() bool
}

type Controller struct {
	store  *store.Store
	runner Runner
	now    func() time.Time
	log    *slog.Logger
}

func New(s *store.Store, runner Runner, now func() time.Time) *Controller {
	if now == nil {
		now = time.Now
	}
	return &Controller{store: s, runner: runner, now: now, log: slog.Default()}
}

func (c *Controller) Start(req transmit.Request) error {
	if err := c.runner.Start(transmit.Command(req, c.now())); err != nil {
		return err
	}
	c.record(req, false)
	return nil
}

// StartTester runs the fixed-time test broadcast, which is recorded so the
// dashboard can tell it apart from an ordinary one.
func (c *Controller) StartTester(req transmit.Request) error {
	if err := c.runner.Start(transmit.Command(req, c.now())); err != nil {
		return err
	}
	c.record(req, true)
	return nil
}

// StartCommand runs a command stored against a schedule.
func (c *Controller) StartCommand(command string) error {
	return c.Start(transmit.Parse(command))
}

func (c *Controller) Stop() {
	c.runner.Stop()
	c.clear()
}

// Finished records that a transmission ended on its own.
func (c *Controller) Finished() { c.clear() }

func (c *Controller) Running() bool { return c.runner.Running() }

func (c *Controller) record(req transmit.Request, isTester bool) {
	details := Details{
		Standard:  req.Standard,
		Duration:  req.DurationMinutes,
		StartedAt: c.now().Format(time.RFC3339),
		IsTester:  isTester,
	}
	if (req.TimeMode == "time_now_with_offset" || req.OffsetEnabled) && req.Offset != 0 {
		offset := req.Offset
		details.Offset = &offset
	}
	if req.TimeMode == "fixed_time" {
		details.FixedTime = req.FixedTime
	}

	if err := c.store.SetStatus("services", "txtempus_running", true); err != nil {
		c.log.Error("record broadcast", "error", err)
	}
	if err := c.store.SetStatus("services", "txtempus_details", details); err != nil {
		c.log.Error("record broadcast", "error", err)
	}
}

func (c *Controller) clear() {
	if err := c.store.SetStatus("services", "txtempus_running", false); err != nil {
		c.log.Error("clear broadcast", "error", err)
	}
	if err := c.store.SetStatus("services", "txtempus_details", Details{}); err != nil {
		c.log.Error("clear broadcast", "error", err)
	}
}

// These fallbacks must stay in step with the dashboard's own defaults.
func DefaultRequest(s *store.Store) transmit.Request {
	request := transmit.Request{
		Standard:        "DCF77",
		DurationMinutes: 10,
		TimeMode:        "time_now",
		FixedTime:       "12:00",
	}

	if value, ok, _ := s.Setting("radio_config", "default_service"); ok && value != "" {
		request.Standard = value
	}
	if value, ok, _ := s.Setting("radio_config", "default_duration_minutes"); ok {
		if parsed, err := strconv.Atoi(value); err == nil {
			request.DurationMinutes = parsed
		}
	}
	if value, ok, _ := s.Setting("radio_config", "default_offset"); ok {
		if parsed, err := strconv.Atoi(value); err == nil {
			request.Offset = parsed
		}
	}
	if value, ok, _ := s.Setting("radio_config", "default_offset_enabled"); ok {
		request.OffsetEnabled = value == "true"
	}
	if value, ok, _ := s.Setting("radio_config", "default_time_mode"); ok && value != "" {
		request.TimeMode = value
	}
	if value, ok, _ := s.Setting("radio_config", "default_fixed_time"); ok && value != "" {
		request.FixedTime = value
	}

	return request
}
