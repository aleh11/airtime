import { Loader2, Play, Square } from 'lucide-react';

export const DURATION_OPTIONS = [
    { label: '10 min', value: 10 },
    { label: '20 min', value: 20 },
    { label: '30 min', value: 30 },
    { label: '1 hr', value: 60 },
    { label: '2 hr', value: 120 },
    { label: '4 hr', value: 240 },
    { label: '6 hr', value: 360 },
];

interface BroadcastPanelProps {
    standards: string[];
    standard: string;
    duration: number;
    isTransmitting: boolean;
    activeStandard?: string | null;
    activeDuration?: number | null;
    busy: boolean;
    onChange: (standard: string, duration: number) => void;
    onToggleBroadcast: () => void;
}

export function BroadcastPanel({
    standards,
    standard,
    duration,
    isTransmitting,
    activeStandard,
    activeDuration,
    busy,
    onChange,
    onToggleBroadcast,
}: BroadcastPanelProps) {
    const selectClass = `w-full bg-slate-900 border border-slate-700 rounded-lg px-3 text-sm font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent h-[40px] ${isTransmitting ? 'opacity-50 cursor-not-allowed' : ''}`;

    return (
        <div className="space-y-1 pb-1">
            <div className="flex gap-2 items-end mb-2">
                <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Service</label>
                    <select
                        value={isTransmitting ? (activeStandard || standard) : standard}
                        onChange={(e) => onChange(e.target.value, duration)}
                        disabled={isTransmitting}
                        className={selectClass}
                    >
                        {standards.map((option) => (
                            <option key={option} value={option}>{option}</option>
                        ))}
                    </select>
                </div>
                <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Duration</label>
                    <select
                        value={isTransmitting ? (activeDuration || duration) : duration}
                        onChange={(e) => onChange(standard, parseInt(e.target.value))}
                        disabled={isTransmitting}
                        className={selectClass}
                    >
                        {DURATION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {isTransmitting ? (
                <button
                    onClick={onToggleBroadcast}
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm transition-all shadow-lg bg-red-600 hover:bg-red-500 text-white shadow-red-900/20"
                >
                    {busy ? <Loader2 className="animate-spin" size={16} /> : <Square size={16} fill="currentColor" />}
                    STOP BROADCAST
                </button>
            ) : (
                <button
                    onClick={onToggleBroadcast}
                    disabled={busy}
                    className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm transition-all shadow-lg ${busy
                        ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                        : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/20'
                        }`}
                >
                    {busy ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} fill="currentColor" />}
                    {busy ? 'STARTING...' : 'BROADCAST NOW'}
                </button>
            )}
        </div>
    );
}
