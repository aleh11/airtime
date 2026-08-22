import { useEffect, useState } from 'react';
import { Clock, X } from 'lucide-react';
import { TimeMode } from '../../hooks/useBroadcastSettings';

interface TimeSettingsModalProps {
    timeMode: TimeMode;
    fixedTime: string;
    offsetHours: number;
    offsetMinutes: number;
    offsetSign: number;
    saving: boolean;
    onTimeModeChange: (mode: TimeMode) => void;
    onFixedTimeChange: (value: string) => void;
    onOffsetSignChange: (sign: number) => void;
    onSave: (hours: number, minutes: number) => void;
    onClose: () => void;
}

function clamp(value: string, max: number, pad: boolean): string {
    const parsed = parseInt(value);
    if (isNaN(parsed)) return '';
    if (parsed < 0) return pad ? '00' : '0';
    if (parsed > max) return max.toString();
    return pad ? parsed.toString().padStart(2, '0') : parsed.toString();
}

export function TimeSettingsModal({
    timeMode,
    fixedTime,
    offsetHours,
    offsetMinutes,
    offsetSign,
    saving,
    onTimeModeChange,
    onFixedTimeChange,
    onOffsetSignChange,
    onSave,
    onClose,
}: TimeSettingsModalProps) {
    const [hours, setHours] = useState('0');
    const [minutes, setMinutes] = useState('00');

    useEffect(() => {
        setHours(offsetHours.toString());
        setMinutes(offsetMinutes.toString().padStart(2, '0'));
    }, [offsetHours, offsetMinutes]);

    const inactive = 'border-slate-700 bg-slate-900/50 hover:border-slate-600';
    const optionClass = (mode: TimeMode, active: string) =>
        `overflow-hidden rounded-xl border-2 transition-all ${timeMode === mode ? active : inactive}`;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-slate-800 rounded-2xl max-w-xs w-full border border-slate-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-full bg-cyan-500/20 text-cyan-400">
                            <Clock size={16} />
                        </div>
                        <h3 className="text-base font-bold text-white">Time Settings</h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-4 space-y-2">
                    <div className={optionClass('time_now', 'border-cyan-500 bg-cyan-500/10')}>
                        <button onClick={() => onTimeModeChange('time_now')} className="w-full flex items-start gap-3 p-3.5 text-left transition-colors">
                            <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${timeMode === 'time_now' ? 'border-cyan-400' : 'border-slate-600'}`}>
                                {timeMode === 'time_now' && <div className="w-2 h-2 rounded-full bg-cyan-400" />}
                            </div>
                            <div>
                                <div className={`text-sm font-semibold transition-colors ${timeMode === 'time_now' ? 'text-cyan-300' : 'text-slate-200'}`}>Time Now</div>
                                <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">Broadcasts using the current system clock.</div>
                            </div>
                        </button>
                    </div>

                    <div className={optionClass('time_now_with_offset', 'border-cyan-500 bg-cyan-500/10')}>
                        <button onClick={() => onTimeModeChange('time_now_with_offset')} className="w-full flex items-start gap-3 p-3.5 text-left transition-colors">
                            <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${timeMode === 'time_now_with_offset' ? 'border-cyan-400' : 'border-slate-600'}`}>
                                {timeMode === 'time_now_with_offset' && <div className="w-2 h-2 rounded-full bg-cyan-400" />}
                            </div>
                            <div>
                                <div className={`text-sm font-semibold transition-colors ${timeMode === 'time_now_with_offset' ? 'text-cyan-300' : 'text-slate-200'}`}>Time Now with Offset</div>
                                <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">Applies a global time offset to the current clock before broadcasting.</div>
                            </div>
                        </button>

                        {timeMode === 'time_now_with_offset' && (
                            <div className="px-3 pb-3 pt-2.5 bg-black/20 border-t border-cyan-500/30 animate-fade-in">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Time Offset</span>
                                    <div className="flex gap-1 relative z-10">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onOffsetSignChange(-1); }}
                                            className={`px-2.5 py-1 rounded-lg font-bold text-[10px] uppercase tracking-wide border transition-all ${offsetSign === -1
                                                ? 'border-orange-500 bg-orange-500/20 text-orange-400 shadow-[inset_0_0_12px_rgba(249,115,22,0.2)]'
                                                : 'border-slate-600 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'}`}
                                        >
                                            Behind
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onOffsetSignChange(1); }}
                                            className={`px-2.5 py-1 rounded-lg font-bold text-[10px] uppercase tracking-wide border transition-all ${offsetSign === 1
                                                ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400 shadow-[inset_0_0_12px_rgba(16,185,129,0.2)]'
                                                : 'border-slate-600 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'}`}
                                        >
                                            Ahead
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 mb-1.5 w-full">
                                    <input
                                        type="number"
                                        value={hours}
                                        onChange={(e) => setHours(clamp(e.target.value, 11, false))}
                                        className="flex-1 min-w-0 bg-slate-900/80 border border-slate-600 rounded-lg p-1.5 text-base font-mono text-center text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                                        placeholder="0"
                                    />
                                    <span className="text-xs text-slate-500 font-bold shrink-0">h</span>
                                    <span className="text-slate-600 font-bold shrink-0">:</span>
                                    <input
                                        type="number"
                                        value={minutes}
                                        onChange={(e) => setMinutes(clamp(e.target.value, 59, true))}
                                        className="flex-1 min-w-0 bg-slate-900/80 border border-slate-600 rounded-lg p-1.5 text-base font-mono text-center text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                                        placeholder="00"
                                    />
                                    <span className="text-xs text-slate-500 font-bold shrink-0">m</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className={optionClass('fixed_time', 'border-violet-500 bg-violet-500/10')}>
                        <button onClick={() => onTimeModeChange('fixed_time')} className="w-full flex items-start gap-3 p-3.5 text-left transition-colors">
                            <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${timeMode === 'fixed_time' ? 'border-violet-400' : 'border-slate-600'}`}>
                                {timeMode === 'fixed_time' && <div className="w-2 h-2 rounded-full bg-violet-400" />}
                            </div>
                            <div>
                                <div className={`text-sm font-semibold transition-colors ${timeMode === 'fixed_time' ? 'text-violet-300' : 'text-slate-200'}`}>Fixed Time</div>
                                <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">Transmits a specific fixed time signal. Useful for verifying hardware and syncing clocks from scratch.</div>
                            </div>
                        </button>
                        {timeMode === 'fixed_time' && (
                            <div className="px-3 pb-3 pt-2.5 bg-black/20 border-t border-violet-500/30 animate-fade-in">
                                <div className="flex items-center justify-center gap-2">
                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide shrink-0">Fixed Time</span>
                                    <input
                                        type="time"
                                        value={fixedTime}
                                        onChange={(e) => onFixedTimeChange(e.target.value)}
                                        className="bg-slate-900/80 border border-violet-500/50 rounded-lg p-1.5 text-base font-mono text-center text-violet-200 focus:ring-2 focus:ring-violet-500 outline-none custom-time-input"
                                        required
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-slate-700">
                    <button
                        onClick={() => onSave(parseInt(hours) || 0, parseInt(minutes) || 0)}
                        disabled={saving}
                        className={`w-full py-2.5 rounded-lg font-bold text-sm transition-colors ${saving ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}`}
                    >
                        {saving ? 'Saving...' : 'Done'}
                    </button>
                </div>
            </div>
        </div>
    );
}
