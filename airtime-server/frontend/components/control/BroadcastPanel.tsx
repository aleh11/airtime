import { Loader2, Play, Square } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '../ui/select';
import { AlwaysOnStatus } from '../../types';
import { AlwaysOnStatusLine } from './AlwaysOnStatusLine';

export const DURATION_OPTIONS = [
    { label: '10 min', value: 10 },
    { label: '20 min', value: 20 },
    { label: '30 min', value: 30 },
    { label: '1 hr', value: 60 },
    { label: '2 hr', value: 120 },
    { label: '4 hr', value: 240 },
    { label: '6 hr', value: 360 },
];

/** The Duration select's value for Always On; never saved as a duration. */
export const ALWAYS_ON = 'always_on';

interface BroadcastPanelProps {
    standards: string[];
    standard: string;
    duration: number;
    /** Always On is picked in the Duration list but not started yet. */
    alwaysOnPicked: boolean;
    /** Always On as the daemon reports it, when enabled. */
    alwaysOn?: AlwaysOnStatus | null;
    fixedTimeMode: boolean;
    isTransmitting: boolean;
    activeStandard?: string | null;
    activeDuration?: number | null;
    busy: boolean;
    onChange: (standard: string, duration: number) => void;
    onPickAlwaysOn: (picked: boolean) => void;
    onToggleBroadcast: () => void;
}

const LABEL_CLASS = 'text-[10px] font-bold tracking-wider text-muted-foreground uppercase';

export function BroadcastPanel({
    standards,
    standard,
    duration,
    alwaysOnPicked,
    alwaysOn,
    fixedTimeMode,
    isTransmitting,
    activeStandard,
    activeDuration,
    busy,
    onChange,
    onPickAlwaysOn,
    onToggleBroadcast,
}: BroadcastPanelProps) {
    const alwaysOnEnabled = !!alwaysOn?.enabled;
    // Always On counts as active from the moment it is enabled, even while it
    // waits for the clock and nothing is on the air yet.
    const active = isTransmitting || alwaysOnEnabled;

    const shownStandard = alwaysOnEnabled
        ? (alwaysOn?.standard || standard)
        : isTransmitting ? (activeStandard || standard) : standard;
    const shownDuration = alwaysOnEnabled || (!active && alwaysOnPicked)
        ? ALWAYS_ON
        : String(isTransmitting ? (activeDuration || duration) : duration);

    const pickDuration = (value: string) => {
        if (value === ALWAYS_ON) {
            onPickAlwaysOn(true);
            return;
        }
        onPickAlwaysOn(false);
        onChange(standard, parseInt(value));
    };

    const buttonLabel = busy
        ? (active ? 'STOPPING...' : 'STARTING...')
        : alwaysOnEnabled ? 'STOP BROADCAST'
            : isTransmitting ? 'STOP BROADCAST'
                : alwaysOnPicked ? 'START ALWAYS ON'
                    : 'BROADCAST NOW';

    return (
        <div className="space-y-1 pb-1">
            <div className="mb-2 flex items-end gap-2">
                <div className="flex-1 space-y-1">
                    <Label className={LABEL_CLASS}>Service</Label>
                    <Select
                        value={shownStandard}
                        onValueChange={(value) => onChange(value, duration)}
                        disabled={active}
                    >
                        <SelectTrigger className="h-10 w-full bg-surface-sunken text-sm font-medium">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {standards.map((option) => (
                                <SelectItem key={option} value={option}>{option}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex-1 space-y-1">
                    <Label className={LABEL_CLASS}>Duration</Label>
                    <Select
                        value={shownDuration}
                        onValueChange={pickDuration}
                        disabled={active}
                    >
                        <SelectTrigger className="h-10 w-full bg-surface-sunken text-sm font-medium">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {DURATION_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
                            ))}
                            <SelectSeparator />
                            <SelectItem value={ALWAYS_ON}>Always On</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {alwaysOnPicked && !active && (
                <p className="pb-1 text-xs text-muted-foreground">
                    Runs without an end and starts again by itself after a reboot.
                    {fixedTimeMode && ' Always On always sends the real time, not your fixed time.'}
                </p>
            )}

            <Button
                onClick={onToggleBroadcast}
                disabled={busy}
                variant={active ? 'destructive' : 'default'}
                className="w-full font-bold shadow-lg"
            >
                {busy ? <Loader2 className="animate-spin" size={16} /> : (
                    active
                        ? <Square size={16} fill="currentColor" />
                        : <Play size={16} fill="currentColor" />
                )}
                {buttonLabel}
            </Button>

            {alwaysOnEnabled && alwaysOn && <AlwaysOnStatusLine status={alwaysOn} />}
        </div>
    );
}
