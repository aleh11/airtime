import { Loader2, Play, Square } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

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

const LABEL_CLASS = 'text-[10px] font-bold tracking-wider text-muted-foreground uppercase';

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
    const shownStandard = isTransmitting ? (activeStandard || standard) : standard;
    const shownDuration = isTransmitting ? (activeDuration || duration) : duration;

    return (
        <div className="space-y-1 pb-1">
            <div className="mb-2 flex items-end gap-2">
                <div className="flex-1 space-y-1">
                    <Label className={LABEL_CLASS}>Service</Label>
                    <Select
                        value={shownStandard}
                        onValueChange={(value) => onChange(value, duration)}
                        disabled={isTransmitting}
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
                        value={String(shownDuration)}
                        onValueChange={(value) => onChange(standard, parseInt(value))}
                        disabled={isTransmitting}
                    >
                        <SelectTrigger className="h-10 w-full bg-surface-sunken text-sm font-medium">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {DURATION_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Button
                onClick={onToggleBroadcast}
                disabled={busy}
                variant={isTransmitting ? 'destructive' : 'default'}
                className="w-full font-bold shadow-lg"
            >
                {busy ? <Loader2 className="animate-spin" size={16} /> : (
                    isTransmitting
                        ? <Square size={16} fill="currentColor" />
                        : <Play size={16} fill="currentColor" />
                )}
                {isTransmitting ? 'STOP BROADCAST' : busy ? 'STARTING...' : 'BROADCAST NOW'}
            </Button>
        </div>
    );
}
