import React, { useEffect, useState, useCallback } from 'react';
import { api } from './services/api';
import { SystemStatus, CronJob, RadioConfig, SystemMetrics } from './types';
import { ClockWidget } from './components/ClockWidget';
import { ControlWidget } from './components/ControlWidget';
import { ScheduleWidget } from './components/ScheduleWidget';
import { PerformanceWidget } from './components/PerformanceWidget';
import UpdateBanner from './components/UpdateBanner';
import { ConfirmModal } from './components/ConfirmModal';
import { RadioTower, Github, AlertTriangle, RefreshCw, RotateCw, FlaskConical } from 'lucide-react';

function App() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [radioConfig, setRadioConfig] = useState<RadioConfig | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ local: string; remote: string } | null>(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateBannerType, setUpdateBannerType] = useState<'available' | 'up-to-date' | null>(null);
  const [showExperimentalModal, setShowExperimentalModal] = useState(false);
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [cronsData, configData] = await Promise.all([
        api.getCrons(),
        api.getRadioConfig()
      ]);
      setCrons(cronsData);
      setRadioConfig(configData);
    } catch (err: any) {
      console.error("Failed to fetch initial data", err);
      setError(err.message || "Failed to connect to backend");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    const pollStatus = async () => {
      try {
        const statusData = await api.getStatus();
        setStatus(statusData);
        setError((prev) => (prev && prev.includes("status") ? null : prev));
      } catch (e) {
        console.error("Status poll failed", e);
      }
    };

    pollStatus();

    const statusInterval = setInterval(pollStatus, 5000);

    const metricsInterval = setInterval(async () => {
      try {
        const m = await api.getSystemMetrics();
        setMetrics(m);
      } catch (e) {
        console.error("Metrics poll failed", e);
      }
    }, 2000);

    return () => {
      clearInterval(statusInterval);
      clearInterval(metricsInterval);
    };
  }, [fetchData]);

  const checkForUpdates = async (manual: boolean = false) => {
    try {
      const updateData = await api.checkUpdates();

      setUpdateInfo({
        local: updateData.local_commit,
        remote: updateData.remote_commit
      });

      if (updateData.updates_available) {
        setUpdateAvailable(true);
        setUpdateBannerType('available');
        setShowUpdateBanner(true);
      } else if (manual) {
        setUpdateAvailable(false);
        setUpdateBannerType('up-to-date');
        setShowUpdateBanner(true);

        setTimeout(() => {
          setUpdateBannerType(prev => {
            if (prev === 'up-to-date') {
              setShowUpdateBanner(false);
              return null;
            }
            return prev;
          });
        }, 5000);
      } else {
        setUpdateAvailable(false);
        setShowUpdateBanner(false);
      }
    } catch (e) {
      console.error("Update check failed", e);
    }
  };

  const handleUpdateClick = () => {
    setShowUpdateModal(true);
  };

  const handleUpdateConfirm = async () => {
    setIsUpdating(true);
    setShowUpdateModal(false);

    try {
      await api.applyUpdate();

      const targetCommit = updateInfo?.remote;
      let attempts = 0;
      const maxGitAttempts = 30;

      while (attempts < maxGitAttempts) {
        try {
          const s = await api.getStatus();
          if (s.git_commit && targetCommit && (s.git_commit.startsWith(targetCommit) || targetCommit.startsWith(s.git_commit))) {
            break;
          }
        } catch (e) {
          break;
        }
        await new Promise(r => setTimeout(r, 2000));
        attempts++;
      }

      const pollUntilOnline = async (): Promise<boolean> => {
        const maxAttempts = 60;
        let attempts = 0;
        while (attempts < maxAttempts) {
          try {
            await api.getStatus();
            return true;
          } catch (e) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
          }
        }
        return false;
      };

      await pollUntilOnline();
      window.location.reload();
    } catch (e) {
      console.error("Update failed:", e);
      setIsUpdating(false);
      alert('Update failed. Please check the logs and try again.');
    }
  };

  const handleBroadcastStart = () => {
    setTimeout(async () => {
      try {
        const s = await api.getStatus();
        setStatus(s);
      } catch (e) { }
    }, 1000);
  };

  const refreshCrons = async () => {
    try {
      const c = await api.getCrons();
      setCrons(c);
    } catch (e) { console.error(e); }
  };

  const handleExperimentalClick = () => {
    setShowExperimentalModal(true);
  };

  const handleExperimentalConfirm = async () => {
    setIsSwitchingBranch(true);
    setShowExperimentalModal(false);

    try {
      const currentBranch = status?.git_branch || 'master';
      const targetBranch = currentBranch === 'experimental' ? 'master' : 'experimental';

      await api.switchBranch(targetBranch);

      // Wait for restart
      await new Promise(r => setTimeout(r, 15000));

      const pollUntilOnline = async (): Promise<boolean> => {
        const maxAttempts = 60;
        let attempts = 0;
        while (attempts < maxAttempts) {
          try {
            await api.getStatus();
            return true;
          } catch (e) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
          }
        }
        return false;
      };

      await pollUntilOnline();
      window.location.reload();
    } catch (e) {
      console.error("Branch switch failed:", e);
      setIsSwitchingBranch(false);
      alert('Branch switch failed. Please check the logs.');
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
              <li>Ensure backend is running</li>
              <li>Check CORS configuration on the server</li>
              <li>Verify endpoints (e.g. /api/status) exist</li>
            </ul>
          </div>
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw size={18} /> Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-4 md:p-8 font-sans selection:bg-cyan-500/30">
      {showUpdateBanner && updateInfo && updateBannerType && (
        <UpdateBanner
          type={updateBannerType}
          localCommit={updateInfo.local}
          remoteCommit={updateInfo.remote}
          onDismiss={() => setShowUpdateBanner(false)}
          onUpdate={handleUpdateClick}
        />
      )}

      <ConfirmModal
        isOpen={showUpdateModal}
        title="Update Available"
        message={`A new version is available. The system will pull the latest changes from git and restart all services. This will take about 10-15 seconds.

Current: ${updateInfo?.local}
New: ${updateInfo?.remote}

Continue with update?`}
        type="info"
        onConfirm={handleUpdateConfirm}
        onClose={() => setShowUpdateModal(false)}
        confirmText="Update Now"
      />

      {isUpdating && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] backdrop-blur-sm">
          <div className="bg-slate-800 rounded-2xl p-8 max-w-sm w-full border border-slate-700 shadow-2xl text-center">
            <div className="mb-6">
              <RotateCw size={48} className="mx-auto animate-spin text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">
              Restarting Server...
            </h3>
            <p className="text-sm text-slate-400 mb-6">
              Update applied. Waiting for server to restart. This should take 10-15 seconds.
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
              <div className="animate-pulse">Polling for connection</div>
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isSwitchingBranch && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] backdrop-blur-sm">
          <div className="bg-slate-800 rounded-2xl p-8 max-w-sm w-full border border-slate-700 shadow-2xl text-center">
            <div className="mb-6">
              <RotateCw size={48} className="mx-auto animate-spin text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">
              Restarting Server...
            </h3>
            <p className="text-sm text-slate-400 mb-6">
              Switching to {status?.git_branch === 'experimental' ? 'master' : 'experimental'} branch. The system will restart shortly.
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
              <div className="animate-pulse">Please wait</div>
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showExperimentalModal}
        title={status?.git_branch === 'experimental' ? 'Disable Experimental Features?' : 'Enable Experimental Features?'}
        message={status?.git_branch === 'experimental'
          ? "This will switch the system back to the stable 'master' branch. The system will restart."
          : "This will switch the system to the 'experimental' branch. New features may be unstable. The system will restart."}
        type={status?.git_branch === 'experimental' ? 'warning' : 'info'}
        onConfirm={handleExperimentalConfirm}
        onClose={() => setShowExperimentalModal(false)}
        confirmText={status?.git_branch === 'experimental' ? 'Disable & Restart' : 'Enable & Restart'}
      />

      <div className="max-w-5xl mx-auto space-y-4">
        <header className="flex items-center justify-between py-2 mb-2">
          <div className="flex items-center gap-3">
            <img src="/airtime-logo.png" alt="Airtime Logo" className="w-14 h-14 object-contain" />
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
              onClick={handleExperimentalClick}
              className={`transition-colors p-1 rounded-md ${status?.git_branch === 'experimental'
                ? 'text-purple-400 border border-purple-500/50 bg-purple-500/10 hover:bg-purple-500/20'
                : 'text-slate-600 hover:text-slate-400'
                }`}
              title={status?.git_branch === 'experimental' ? "Experimental Features Enabled" : "Enable Experimental Features"}
            >
              <FlaskConical size={20} />
            </button>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="order-1 lg:col-span-7">
            <ClockWidget status={status} />
          </div>

          <div className="order-2 lg:col-span-5 lg:row-span-2 h-full">
            <ControlWidget
              radioConfig={radioConfig}
              onBroadcastStart={handleBroadcastStart}
              onCheckUpdates={() => checkForUpdates(true)}
              isTransmitting={status?.services.txtempus_running}
              activeService={status?.services.txtempus_service}
              activeDuration={status?.services.txtempus_duration}
              remainingSeconds={status?.services.txtempus_remaining_seconds}
            />
          </div>

          <div className="order-3 lg:col-span-7">
            <PerformanceWidget metrics={metrics} status={status} />
          </div>

          <div className="order-4 lg:col-span-12">
            <ScheduleWidget
              jobs={crons}
              onUpdate={refreshCrons}
              radioConfig={radioConfig}
              status={status}
            />
          </div>
        </main>

        <footer className="text-center text-xs text-slate-600 pt-12 pb-4">
          Airtime Control Dashboard • Build: {status?.git_commit || 'unknown'}
        </footer>
      </div>
    </div>
  );
}

export default App;
