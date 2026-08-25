import { useEffect, useState } from 'react';
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
import { api } from './services/api';
import { RadioTower, Github, AlertTriangle, RefreshCw, FlaskConical } from 'lucide-react';

function App() {
  const { status, metrics, refreshStatus } = useSystemStatus();
  const { schedules, radioConfig, loading, error, refresh, refreshSchedules, retry } = useDashboardData();
  const update = useSystemUpdate();

  const [timeTesterEnabled, setTimeTesterEnabled] = useState(false);
  const [betaEnabled, setBetaEnabled] = useState(false);
  const [confirmBeta, setConfirmBeta] = useState(false);

  useEffect(() => {
    api.getReleaseChannel()
      .then(({ channel }) => setBetaEnabled(channel === 'beta'))
      .catch((e) => console.error('Could not read the release channel', e));
  }, []);

  const applyChannel = async (channel: 'stable' | 'beta') => {
    setConfirmBeta(false);
    try {
      await api.setReleaseChannel(channel);
      setBetaEnabled(channel === 'beta');
      update.check(true);
    } catch (e) {
      console.error('Could not change the release channel', e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-500 animate-pulse">
        <RadioTower size={48} className="mb-4" />
      </div>
    );
  }

  if (error && !status && !radioConfig) {
    return <ConnectionFailed error={error} onRetry={retry} />;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-4 md:p-8 font-sans selection:bg-amber-500/30">
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

      <ConfirmModal
        isOpen={confirmBeta}
        title="Enable Beta Releases?"
        message={`This install will be offered beta builds, which are published straight from development and may be unstable.

You can switch back to stable at any time.`}
        type="info"
        onConfirm={() => applyChannel('beta')}
        onClose={() => setConfirmBeta(false)}
        confirmText="Enable"
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
              <h1 className="text-xl font-bold tracking-tight text-white">AirTime</h1>
              <p className="text-xs text-slate-500 font-mono">LOCAL TIME-SIGNAL TRANSMITTER</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a href="https://airtime.diy/" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors text-xs font-mono">
              Website
            </a>
            <a href="https://github.com/aleh11/airtime" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors">
              <Github size={20} />
            </a>
            <button
              onClick={() => (betaEnabled ? applyChannel('stable') : setConfirmBeta(true))}
              className={`transition-colors p-1 rounded-md ${betaEnabled
                ? 'text-purple-400 border border-purple-500/50 bg-purple-500/10 hover:bg-purple-500/20'
                : 'text-slate-600 hover:text-slate-400'
                }`}
              title={betaEnabled ? 'Beta releases enabled' : 'Enable beta releases'}
            >
              <FlaskConical size={20} />
            </button>
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

        <footer className="text-center text-xs text-slate-600 pt-12 pb-4">
          AirTime Control Dashboard • {status?.version || 'unknown version'}
        </footer>
      </div>
    </div>
  );
}

function ConnectionFailed({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="bg-slate-800 border border-red-900/50 p-8 rounded-2xl max-w-md w-full text-center shadow-2xl">
        <div className="bg-red-900/20 p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-6 text-red-500">
          <AlertTriangle size={32} />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Connection Failed</h2>
        <p className="text-slate-400 mb-6 font-mono text-sm">{error}</p>
        <div className="text-xs text-slate-500 mb-8 bg-slate-900 p-4 rounded text-left">
          <p className="font-semibold mb-2">Troubleshooting:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Check the daemon is running: <span className="font-mono">systemctl status airtime</span></li>
            <li>Check the logs: <span className="font-mono">journalctl -u airtime -f</span></li>
          </ul>
        </div>
        <button
          onClick={onRetry}
          className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <RefreshCw size={18} /> Retry Connection
        </button>
      </div>
    </div>
  );
}

export default App;
