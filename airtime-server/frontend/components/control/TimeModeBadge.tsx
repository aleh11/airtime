import { Badge } from '../ui/badge';
import { TimeMode } from '../../hooks/useBroadcastSettings';

interface TimeModeBadgeProps {
    timeMode: TimeMode;
    fixedTime: string;
    offsetEnabled: boolean;
    offsetHours: number;
    offsetMinutes: number;
    offsetSign: number;
}

const CHIP_CLASS = 'ml-1 rounded-md border px-2 py-px font-mono text-[10px] font-bold';

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
        return <Badge variant="testing" className={CHIP_CLASS}>Fixed {fixedTime}</Badge>;
    }

    if (offsetEnabled && (offsetHours > 0 || offsetMinutes > 0)) {
        return (
            <Badge variant={offsetSign > 0 ? 'offsetPositive' : 'offsetNegative'} className={CHIP_CLASS}>
                {offsetSign > 0 ? '+' : '-'}{offsetHours ? `${offsetHours}h ` : ''}{offsetMinutes}m
            </Badge>
        );
    }

    if (timeMode === 'time_now') {
        return <Badge variant="onAir" className={CHIP_CLASS}>NOW</Badge>;
    }

    return <span className="font-mono text-[10px] text-subtle-foreground uppercase">Offset</span>;
}
