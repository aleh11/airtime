import { FlaskConical, Loader2, X } from 'lucide-react';

interface TimeTesterModalProps {
    standards: string[];
    standard: string;
    durationHours: 12 | 24;
    busy: boolean;
    onStandardChange: (standard: string) => void;
    onDurationChange: (hours: 12 | 24) => void;
    onStart: () => void;
    onClose: () => void;
}

export function TimeTesterModal({
    standards,
    standard,
    durationHours,
    busy,
    onStandardChange,
    onDurationChange,
    onStart,
    onClose,
}: TimeTesterModalProps) {
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-slate-800 rounded-2xl max-w-xs w-full border border-slate-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-full bg-violet-500/20 text-violet-400">
                            <FlaskConical size={16} />
                        </div>
                        <h3 className="text-base font-bold text-white">Time Tester</h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400">
                        <X size={16} />
                    </button>
                </div>

                <div className="px-5 py-3 bg-violet-500/10 border-b border-violet-500/20">
                    <p className="text-[11px] text-violet-200/80 leading-relaxed">
                        Broadcasts a <strong className="text-violet-300">fixed 12:00 time signal</strong> for testing clocks and devices.
                        Scheduled broadcasts are paused for the duration and restored automatically when stopped.
                    </p>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Service</label>
                        <select
                            value={standard}
                            onChange={(e) => onStandardChange(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 text-sm font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent h-[40px]"
                        >
                            {standards.map((option) => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Duration</label>
                        <div className="grid grid-cols-2 gap-2">
                            {([12, 24] as const).map((hours) => (
                                <button
                                    key={hours}
                                    onClick={() => onDurationChange(hours)}
                                    className={`py-2.5 rounded-lg font-bold text-sm border-2 transition-all ${durationHours === hours
                                        ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                                        : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-violet-500/50'
                                        }`}
                                >
                                    {hours} hours
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-slate-700 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-lg font-bold text-sm bg-slate-700 hover:bg-slate-600 text-slate-200">
                        Cancel
                    </button>
                    <button
                        disabled={busy}
                        onClick={onStart}
                        className="flex-1 py-2.5 rounded-lg font-bold text-sm bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {busy ? <Loader2 className="animate-spin" size={16} /> : <FlaskConical size={16} />}
                        Start
                    </button>
                </div>
            </div>
        </div>
    );
}
