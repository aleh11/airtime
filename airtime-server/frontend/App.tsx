import React, { useEffect, useState, useCallback } from 'react';
import { api } from './services/api';
import { SystemStatus, CronJob, RadioConfig, SystemMetrics } from './types';
import { ClockWidget } from './components/ClockWidget';
import { ControlWidget } from './components/ControlWidget';
import { ScheduleWidget } from './components/ScheduleWidget';
import { PerformanceWidget } from './components/PerformanceWidget';
import UpdateBanner from './components/UpdateBanner';
import { ConfirmModal } from './components/ConfirmModal';
import { RadioTower, Github, AlertTriangle, RefreshCw, RotateCw } from 'lucide-react';

function App() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [radioConfig, setRadioConfig] = useState<RadioConfig | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Update system state
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ local: string; remote: string } | null>(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateBannerType, setUpdateBannerType] = useState<'available' | 'up-to-date' | null>(null);

  // Initial Data Load
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

  // Poll for status every 5 seconds
  useEffect(() => {
    fetchData();

    const pollStatus = async () => {
      try {
        const statusData = await api.getStatus();
        setStatus(statusData);
        // Clear error if we successfully reconnect
        setError((prev) => (prev && prev.includes("status") ? null : prev));
      } catch (e) {
        console.error("Status poll failed", e);
      }
    };

    pollStatus(); // Immediate first call

    // Poll status every 5s
    const statusInterval = setInterval(pollStatus, 5000);

    // Poll metrics every 2s
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

  // Manual Update Check
  const checkForUpdates = async (manual: boolean = false) => {
    try {
      console.log('[DEBUG] Checking for updates...');
      const updateData = await api.checkUpdates();
      console.log('[DEBUG] Update check result:', updateData);

      setUpdateInfo({
        local: updateData.local_commit,
        remote: updateData.remote_commit
      });

      if (updateData.updates_available) {
        setUpdateAvailable(true);
        setUpdateBannerType('available');
        setShowUpdateBanner(true);
        console.log('[DEBUG] Update available - showing banner');
      } else if (manual) {
        setUpdateAvailable(false);
        setUpdateBannerType('up-to-date');
        setShowUpdateBanner(true);

        // Auto dismiss "up to date" after 5 seconds
        setTimeout(() => {
          // Only dismiss if it's still 'up-to-date' (don't hide if it became 'available' in the meantime? unlikely)
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

  // Debug: Monitor showUpdateModal state changes
  useEffect(() => {
    console.log('[DEBUG] showUpdateModal state changed to:', showUpdateModal);
  }, [showUpdateModal]);

  // Handle update confirmation
  const handleUpdateClick = () => {
    console.log('[DEBUG] Update Now clicked - opening modal');
    console.log('[DEBUG] Current showUpdateModal state:', showUpdateModal);
    setShowUpdateModal(true);
    console.log('[DEBUG] setShowUpdateModal(true) called');
  };

  const handleUpdateConfirm = async () => {
    console.log('[DEBUG] Update confirmed - starting update process');
    setIsUpdating(true);
    setShowUpdateModal(false); // Close confirmation modal immediately

    try {
      console.log('[DEBUG] Calling api.applyUpdate()');
      await api.applyUpdate();
      console.log('[DEBUG] api.applyUpdate() successful');

      // Phase 1: Wait for Git Update to reflect in status
      // We poll until the system reports the new commit hash, OR the server goes down (restart started)
      console.log('[DEBUG] Polling for git commit update...');
      const targetCommit = updateInfo?.remote;

      let updateApplied = false;
      let attempts = 0;
      const maxGitAttempts = 30; // 60 seconds max for git pull

      while (attempts < maxGitAttempts) {
        try {
          const s = await api.getStatus();
          // Check if commit matches
          if (s.git_commit && targetCommit && s.git_commit.startsWith(targetCommit)) {
            console.log('[DEBUG] Git commit match confirmed!');
            updateApplied = true;
            break;
          }
          // Also check if commit matches the *other* way (in case target is short/long)
          if (s.git_commit && targetCommit && targetCommit.startsWith(s.git_commit)) {
            console.log('[DEBUG] Git commit match confirmed (short)!');
            updateApplied = true;
            break;
          }
        } catch (e) {
          // If server goes down, it means restart likely started
          console.log('[DEBUG] Server went down during polling - assuming update applied and restart started');
          updateApplied = true;
          break;
        }
        await new Promise(r => setTimeout(r, 2000));
        attempts++;
      }

      if (!updateApplied) {
        console.warn('[DEBUG] Update polling timed out, but proceeding to restart check anyway');
      }

      // Phase 2: Restart Polling
      // Now we just wait for the server to come back ONLINE
      console.log('[DEBUG] Starting reconnection polling');

      // We reuse the isUpdating state but could update UI text if we had a state for "step"
      // For now, "Restarting Server..." covers both perfectly.

      const pollUntilOnline = async (): Promise<boolean> => {
        const maxAttempts = 60; // 60 seconds
        let attempts = 0;

        while (attempts < maxAttempts) {
          try {
            await api.getStatus();
            console.log('[DEBUG] Server back online!');
            return true;
          } catch (e) {
            console.log(`[DEBUG] Server still down, attempt ${attempts + 1}/${maxAttempts}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
          }
        }
        return false;
      };

      const online = await pollUntilOnline();

      if (online) {
        console.log('[DEBUG] Update successful, reloading page');
        window.location.reload();
      } else {
        console.log('[DEBUG] Timeout - forcing reload anyway');
        window.location.reload();
      }

    } catch (e) {
      console.error("[DEBUG] Update failed:", e);
      setIsUpdating(false);
      alert('Update failed. Please check the logs and try again.');
    }
  };

  const handleBroadcastStart = () => {
    // Refresh status immediately to show "TX ACTIVE"
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-500 animate-pulse">
        <RadioTower size={48} className="mb-4" />
      </div>
    );
  }

  // Error State Display
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
      {/* Update Banner */}
      {showUpdateBanner && updateInfo && updateBannerType && (
        <UpdateBanner
          type={updateBannerType}
          localCommit={updateInfo.local}
          remoteCommit={updateInfo.remote}
          onDismiss={() => setShowUpdateBanner(false)}
          onUpdate={handleUpdateClick}
        />
      )}

      {/* Update Confirmation Modal */}
      {console.log('[DEBUG] Rendering ConfirmModal with showUpdateModal =', showUpdateModal)}
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

      {/* Update in Progress Loading Overlay */}
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

      <div className="max-w-5xl mx-auto space-y-4">

        {/* Header */}
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
          </div>
        </header>

        {/* Dashboard Grid */}
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* Clock - Mobile Order 1, Desktop Left */}
          <div className="order-1 lg:col-span-7">
            <ClockWidget status={status} />
          </div>

          {/* Control - Mobile Order 2, Desktop Right (Spans 2 rows roughly) */}
          {/* Note: In a flat grid, if we want Control to be on the right and span the height of Clock+Perf, 
              we need to handle the rows carefully or go back to a different strategy. 
              However, CSS Grid flow dense or simple column spans works if height aligns. 
              But ensuring Control is to the right of Clock AND Performance is tricky with just col-spans in a single flatted grid if rows aren't fixed.
              
              actually, simpler approach: 
              Mobile: Flex-col with order.
              Desktop: Grid with 2 columns.
              
              Let's try:
              flex flex-col lg:grid lg:grid-cols-12
          */}

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

          {/* Performance - Mobile Order 3, Desktop Left (under Clock) */}
          <div className="order-3 lg:col-span-7">
            <PerformanceWidget metrics={metrics} status={status} />
          </div>

          {/* Schedule - Mobile Order 4, Desktop Bottom */}
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