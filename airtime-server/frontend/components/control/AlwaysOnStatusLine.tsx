import { useEffect, useState } from 'react';
import { Thermometer } from 'lucide-react';
import { AlwaysOnStatus } from '../../types';

const formatClock = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

const secondsUntil = (iso: string, now: number) => {
    const at = new Date(iso).getTime();
    if (Number.isNaN(at)) return 0;
    return Math.max(0, Math.ceil((at - now) / 1000));
};

// After this long without a clock, the network hint moves out of the tooltip
// and into the line itself: someone who plugged in an offline unit needs it.
const LONG_WAIT_MS = 5 * 60 * 1000;

/** One line under the broadcast button saying what Always On is doing. */
export function AlwaysOnStatusLine({ status }: { status: AlwaysOnStatus }) {
    const [now, setNow] = useState(() => Date.now());
    const [waitingSince, setWaitingSince] = useState<number | null>(null);

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        if (status.state === 'waiting_for_sync') {
            setWaitingSince((prev) => prev ?? Date.now());
        } else {
            setWaitingSince(null);
        }
    }, [status.state]);

    let tone = 'text-muted-foreground';
    let dot = 'bg-muted-foreground';
    let text = '';
    let title: string | undefined;
    let thermal = false;

    switch (status.state) {
        case 'starting':
            text = 'Starting Always On…';
            break;
        case 'waiting_for_sync': {
            tone = 'text-warning';
            dot = 'bg-warning animate-pulse';
            const long = waitingSince !== null && now - waitingSince > LONG_WAIT_MS;
            text = long
                ? 'Waiting for time sync: check Wi-Fi or Ethernet'
                : 'Waiting for time sync';
            title = 'Always On needs Wi-Fi or Ethernet to get the time. It never broadcasts an unchecked clock.';
            break;
        }
        case 'on_air':
            tone = 'text-success';
            dot = 'bg-success';
            text = status.since ? `On air since ${formatClock(status.since)}` : 'On air';
            break;
        case 'backoff': {
            tone = 'text-danger';
            dot = 'bg-danger';
            const wait = status.retry_at ? secondsUntil(status.retry_at, now) : 0;
            text = wait > 0
                ? `Restarting after an error (retry in ${wait}s)`
                : 'Restarting after an error';
            title = status.last_error || undefined;
            break;
        }
        case 'thermal_pause':
            tone = 'text-danger';
            thermal = true;
            text = `Paused: ${status.last_error || 'too hot'}`;
            title = 'Broadcasting resumes by itself once the Pi cools down.';
            break;
        default:
            return null;
    }

    return (
        <div
            role="status"
            title={title}
            className={`flex items-center justify-center gap-2 pt-1.5 text-xs font-medium ${tone}`}
        >
            {thermal
                ? <Thermometer size={14} aria-hidden="true" />
                : <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dot}`} />}
            <span>{text}</span>
        </div>
    );
}
