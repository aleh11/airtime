import { TimeMode } from '../../hooks/useBroadcastSettings';

interface TimeModeBadgeProps {
    timeMode: TimeMode;
    fixedTime: string;
    offsetEnabled: boolean;
    offsetHours: number;
    offsetMinutes: number;
    offsetSign: number;
}

/** Summarises the current time mode as a single chip beside its settings row. */
export function TimeModeBadge({
    timeMode,
    fixedTime,
    offsetEnabled,
    offsetHours,
    offsetMinutes,
    offsetSign,
}: TimeModeBadgeProps) {
    if (timeMode === 'fixed_time') {
        return (
            <span className="text-[10px] font-mono font-bold px-2 py-px rounded-md border text-violet-400 bg-violet-500/10 border-violet-500/30 ml-1">
                Fixed {fixedTime}
            </span>
        );
    }

    if (offsetEnabled && (offsetHours > 0 || offsetMinutes > 0)) {
        return (
            <span className={`text-[10px] font-mono font-bold px-2 py-px rounded-md border ${offsetSign > 0
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                : 'text-orange-400 bg-orange-500/10 border-orange-500/30'} ml-1`}>
                {offsetSign > 0 ? '+' : '-'}{offsetHours ? `${offsetHours}h ` : ''}{offsetMinutes}m
            </span>
        );
    }

    if (timeMode === 'time_now') {
        return (
            <span className="text-[10px] font-mono font-bold px-2 py-px rounded-md border text-cyan-400 bg-cyan-500/10 border-cyan-500/30 ml-1">
                NOW
            </span>
        );
    }

    return <span className="text-[10px] font-mono text-slate-500 uppercase">Offset</span>;
}
