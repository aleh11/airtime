import { useState } from 'react';
import { ClockWidget } from './components/ClockWidget';
import { ControlWidget } from './components/ControlWidget';
import { ScheduleWidget } from './components/ScheduleWidget';
import { PerformanceWidget } from './components/PerformanceWidget';
import UpdateBanner from './components/UpdateBanner';
import { ConfirmModal } from './components/ConfirmModal';
import { RestartOverlay } from './components/RestartOverlay';
import { useSystemStatus } from './hooks/useSystemStatus';
import { useDashboardData } from './hooks/useDashboardData';
import { useSystemUpdate } from './hooks/useSystemUpdate';
import { useUiConfig } from './hooks/useUiConfig';
import { ThemePicker } from './components/ThemePicker';
import { Button } from './components/ui/button';
import { RadioTower, Github, AlertTriangle, RefreshCw } from 'lucide-react';

function App() {
  const { status, metrics, refreshStatus } = useSystemStatus();
  const { schedules, radioConfig, loading, error, refresh, refreshSchedules, retry } = useDashboardData();
  const update = useSystemUpdate();
  const ui = useUiConfig();

  const [timeTesterEnabled, setTimeTesterEnabled] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen animate-pulse items-center justify-center bg-background text-subtle-foreground">
        <RadioTower size={48} className="mb-4" />
      </div>
    );
  }

  if (error && !status && !radioConfig) {
    return <ConnectionFailed error={error} onRetry={retry} />;
  }

  return (
    <div className="min-h-screen bg-background p-4 font-sans text-foreground selection:bg-primary/30 md:p-8">
      {update.banner && update.info && (
        <UpdateBanner
          type={update.banner}
          currentVersion={update.info.current_version}
          latestVersion={update.info.latest_version}
          onDismiss={update.dismissBanner}
          onUpdate={update.requestConfirmation}
        />
      )}

      <ConfirmModal
        isOpen={update.confirming}
        title="Update Available"
        message={`AirTime will download and verify the latest release, then restart.

Current: ${update.info?.current_version}
New: ${update.info?.latest_version}

Your schedules and settings are kept.`}
        type="info"
        onConfirm={update.install}
        onClose={update.cancelConfirmation}
        confirmText="Update Now"
      />

      {update.installing && (
        <RestartOverlay
          title="Installing Update"
          message="AirTime is downloading the release, verifying it, and restarting. This usually takes 10-20 seconds."
          hint="Waiting for the daemon"
        />
      )}

      <div className="max-w-5xl mx-auto space-y-4">
        <header className="flex items-center justify-between py-2 mb-2">
          <div className="flex items-center gap-3">
            <img src="/airtime-logo.png" alt="AirTime" className="w-14 h-14 object-contain" />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-heading">AirTime</h1>
              <p className="font-mono text-xs text-subtle-foreground">LOCAL TIME-SIGNAL TRANSMITTER</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemePicker theme={ui.theme} themes={ui.availableThemes} onSelect={ui.setTheme} />
            <a href="https://airtime.diy/" target="_blank" rel="noreferrer" className="font-mono text-xs text-subtle-foreground transition-colors hover:text-foreground">
              Website
            </a>
            <a href="https://github.com/aleh11/airtime" target="_blank" rel="noreferrer" className="text-subtle-foreground transition-colors hover:text-foreground">
              <Github size={20} />
            </a>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="order-1 lg:col-span-7">
            <ClockWidget
              status={status}
              radioConfig={radioConfig}
              timeTesterEnabled={timeTesterEnabled}
            />
          </div>

          <div className="order-2 lg:col-span-5 lg:row-span-2 h-full">
            <ControlWidget
              radioConfig={radioConfig}
              onBroadcastStart={() => setTimeout(refreshStatus, 1000)}
              onCheckUpdates={() => update.check(true)}
              onSettingsSaved={refresh}
              isTransmitting={status?.services.txtempus_running}
              activeService={status?.services.txtempus_service}
              activeDuration={status?.services.txtempus_duration}
              remainingSeconds={status?.services.txtempus_remaining_seconds}
              onTimeTesterChange={(enabled) => {
                setTimeTesterEnabled(enabled);
                refresh();
              }}
            />
          </div>

          <div className="order-3 lg:col-span-7">
            <PerformanceWidget metrics={metrics} status={status} />
          </div>

          <div className="order-4 lg:col-span-12">
            <ScheduleWidget
              jobs={schedules}
              onUpdate={refreshSchedules}
              radioConfig={radioConfig}
              status={status}
              timeTesterEnabled={timeTesterEnabled}
            />
          </div>
        </main>

        <footer className="pt-12 pb-4 text-center text-xs text-faint-foreground">
          AirTime Control Dashboard • {status?.version || 'unknown version'}
        </footer>
      </div>
    </div>
  );
}

function ConnectionFailed({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-danger/50 bg-card p-8 text-center shadow-2xl">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-danger/20 text-danger">
          <AlertTriangle size={32} />
        </div>
        <h2 className="mb-2 text-xl font-bold text-heading">Connection Failed</h2>
        <p className="mb-6 font-mono text-sm text-muted-foreground">{error}</p>
        <div className="mb-8 rounded bg-surface-sunken p-4 text-left text-xs text-subtle-foreground">
          <p className="font-semibold mb-2">Troubleshooting:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Check the daemon is running: <span className="font-mono">systemctl status airtime</span></li>
            <li>Check the logs: <span className="font-mono">journalctl -u airtime -f</span></li>
          </ul>
        </div>
        <Button variant="destructive" size="lg" onClick={onRetry} className="w-full font-semibold">
          <RefreshCw size={18} /> Retry Connection
        </Button>
      </div>
    </div>
  );
}

export default App;
