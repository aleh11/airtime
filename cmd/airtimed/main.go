package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/aleh11/airtime/internal/api"
	"github.com/aleh11/airtime/internal/broadcast"
	"github.com/aleh11/airtime/internal/gpio"
	"github.com/aleh11/airtime/internal/health"
	"github.com/aleh11/airtime/internal/metrics"
	"github.com/aleh11/airtime/internal/scheduler"
	"github.com/aleh11/airtime/internal/store"
	"github.com/aleh11/airtime/internal/tlsgen"
	"github.com/aleh11/airtime/internal/transmit"
	"github.com/aleh11/airtime/internal/update"
	"github.com/aleh11/airtime/internal/web"
)

// version is set at build time with -ldflags "-X main.version=v0.1.0".
var version = "dev"

type config struct {
	stateDir    string
	legacyDB    string
	listen      string
	certPath    string
	keyPath     string
	gpioChip    string
	requestPath string
	serviceName string
}

func loadConfig() config {
	stateDir := envOr("AIRTIME_STATE_DIR", "/var/lib/airtime")
	return config{
		stateDir:    stateDir,
		legacyDB:    envOr("AIRTIME_LEGACY_DB", "/home/time/airtime/airtime-server/database/airtime.db"),
		listen:      envOr("AIRTIME_LISTEN", ":8443"),
		certPath:    envOr("AIRTIME_TLS_CERT", filepath.Join(stateDir, "tls", "cert.pem")),
		keyPath:     envOr("AIRTIME_TLS_KEY", filepath.Join(stateDir, "tls", "key.pem")),
		gpioChip:    envOr("AIRTIME_GPIO_CHIP", "gpiochip0"),
		requestPath: envOr("AIRTIME_UPDATE_REQUEST", filepath.Join(stateDir, "update.request")),
		serviceName: envOr("AIRTIME_SERVICE_NAME", "airtime"),
	}
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})))

	if err := run(); err != nil {
		slog.Error("airtime stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg := loadConfig()
	slog.Info("starting airtime", "version", version, "state", cfg.stateDir)

	if migrated, err := store.MigrateLegacy(cfg.legacyDB, cfg.stateDir); err != nil {
		slog.Error("legacy database migration failed", "error", err)
	} else if migrated {
		slog.Info("migrated database from the previous install", "from", cfg.legacyDB)
	}

	db, err := store.Open(cfg.stateDir)
	if err != nil {
		return err
	}
	defer db.Close()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var broadcaster *broadcast.Controller
	runner := transmit.NewRunner(func(err error) {
		if err != nil && !errors.Is(err, context.Canceled) {
			slog.Info("transmission ended", "reason", err)
		}
		broadcaster.Finished()
	})
	broadcaster = broadcast.New(db, runner, time.Now)
	// A transmission never survives a daemon restart, so the recorded state is
	// stale by definition at startup.
	db.SetStatus("services", "txtempus_running", false)

	leds := openGPIO(cfg, db, broadcaster)
	if leds != nil {
		defer leds.Close()
		// Runs before the monitor starts, not alongside it: the monitor drives the
		// same three lines every 50ms and caches what it last wrote, so a
		// concurrent sweep would both fight it and leave that cache lying.
		gpio.StartupAnimation(leds)
	}

	monitor := health.NewMonitor(db, leds, broadcaster.Running)
	go monitor.Run(ctx)

	schedules := scheduler.NewService(db, broadcaster)
	go schedules.Run(ctx)

	if err := tlsgen.EnsureSelfSigned(cfg.certPath, cfg.keyPath); err != nil {
		return err
	}

	collector := metrics.NewCollector()
	go collector.Run(ctx)

	handler := api.New(api.Deps{
		Store:   db,
		Runner:  broadcaster,
		Metrics: collector,
		Updater: update.Checker{
			Current:     version,
			RequestPath: cfg.requestPath,
			Beta: func() bool {
				channel, _, _ := db.Setting("app_config", "release_channel")
				return channel == "beta"
			},
		},
		Version: version,
		Static:  web.Handler(),
		RestartService: func() error {
			return exec.Command("systemctl", "restart", cfg.serviceName).Start()
		},
		RebootHost: func() error {
			return exec.Command("systemctl", "reboot").Start()
		},
	})

	server := &http.Server{
		Addr:              cfg.listen,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		server.Shutdown(shutdownCtx)
		runner.Stop()
	}()

	slog.Info("dashboard listening", "addr", cfg.listen)
	if err := server.ListenAndServeTLS(cfg.certPath, cfg.keyPath); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}

	slog.Info("airtime stopped cleanly")
	return nil
}

func boolText(value bool) string {
	if value {
		return "true"
	}
	return "false"
}

func openGPIO(cfg config, db *store.Store, broadcaster *broadcast.Controller) gpio.Controller {
	buttons := gpio.Buttons{
		// A press toggles, as the hat has always done. Wiring it to Stop alone
		// meant the button did nothing at all unless something was already on
		// air, and never lit the antenna LED.
		OnPress: func() {
			if broadcaster.Running() {
				slog.Info("control button: stopping broadcast")
				broadcaster.Stop()
				return
			}
			request := broadcast.DefaultRequest(db)
			slog.Info("control button: starting broadcast", "standard", request.Standard, "duration", request.DurationMinutes)
			if err := broadcaster.Start(request); err != nil {
				slog.Error("control button: could not start broadcast", "error", err)
			}
		},
		OnHold: func() {
			stealth, _, _ := db.Setting("app_config", "stealth_mode")
			enabled := stealth != "true"
			if err := db.SetSetting("app_config", "stealth_mode", boolText(enabled)); err != nil {
				slog.Error("control button: could not toggle stealth", "error", err)
				return
			}
			slog.Info("control button: stealth toggled", "enabled", enabled)
		},
	}

	leds, err := gpio.Open(cfg.gpioChip, gpio.DefaultPins, buttons)
	if err != nil {
		slog.Warn("gpio unavailable; continuing without hardware indicators", "error", err)
		return nil
	}
	return leds
}
