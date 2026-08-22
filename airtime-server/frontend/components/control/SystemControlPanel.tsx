import { Clock, RefreshCw, RotateCw, Settings, Zap } from 'lucide-react';
import { TimeModeBadge } from './TimeModeBadge';
import { TimeMode } from '../../hooks/useBroadcastSettings';

interface SystemControlPanelProps {
    ledsEnabled: boolean;
    isTransmitting: boolean;
    timeMode: TimeMode;
    fixedTime: string;
    offsetEnabled: boolean;
    offsetHours: number;
    offsetMinutes: number;
    offsetSign: number;
    onToggleLeds: () => void;
    onOpenTimeSettings: () => void;
    onRestartService: () => void;
    onRestartPi: () => void;
    onCheckUpdates: () => void;
}

export function SystemControlPanel({
    ledsEnabled,
    isTransmitting,
    timeMode,
    fixedTime,
    offsetEnabled,
    offsetHours,
    offsetMinutes,
    offsetSign,
    onToggleLeds,
    onOpenTimeSettings,
    onRestartService,
    onRestartPi,
    onCheckUpdates,
}: SystemControlPanelProps) {
    return (
        <div className="space-y-2">
            <h3 className="text-slate-100 font-semibold text-lg">System Control</h3>

            <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded-full ${ledsEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                        <Zap size={14} />
                    </div>
                    <div className="text-sm font-medium text-slate-200">System LEDs</div>
                </div>

                <button
                    onClick={onToggleLeds}
                    className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-200 ease-in-out relative inline-flex items-center ${ledsEnabled ? 'bg-emerald-500/80' : 'bg-slate-600'}`}
                    aria-label="Toggle system LEDs"
                >
                    <div className={`bg-white w-3 h-3 rounded-full shadow transform transition-transform duration-200 ${ledsEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
            </div>

            <button
                onClick={onOpenTimeSettings}
                className="w-full flex items-center justify-between p-2 bg-slate-800/50 rounded-lg border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors text-left"
            >
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-full bg-slate-700 text-cyan-400">
                        <Clock size={14} />
                    </div>
                    <div className="text-sm font-medium text-slate-200 flex items-center gap-2">
                        Time Settings
                        <TimeModeBadge
                            timeMode={timeMode}
                            fixedTime={fixedTime}
                            offsetEnabled={offsetEnabled}
                            offsetHours={offsetHours}
                            offsetMinutes={offsetMinutes}
                            offsetSign={offsetSign}
                        />
                    </div>
                </div>
                <Settings size={13} className="text-slate-500" />
            </button>

            <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                    onClick={onRestartService}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold text-[10px] tracking-wide transition-all bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-lg shadow-purple-900/10"
                >
                    <RotateCw size={13} />
                    AIRTIME
                </button>
                <button
                    onClick={onRestartPi}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold text-[10px] tracking-wide transition-all bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 shadow-lg shadow-red-900/10"
                >
                    <RotateCw size={13} />
                    PI
                </button>
                <button
                    onClick={onCheckUpdates}
                    disabled={isTransmitting}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold text-[10px] tracking-wide transition-all border shadow-lg ${isTransmitting
                        ? 'bg-slate-800 text-slate-600 border-slate-700 shadow-none cursor-not-allowed opacity-50'
                        : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/30 shadow-cyan-900/10'}`}
                >
                    <RefreshCw size={13} />
                    UPDATE
                </button>
            </div>
        </div>
    );
}
