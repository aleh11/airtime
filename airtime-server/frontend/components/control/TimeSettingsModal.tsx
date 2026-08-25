import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { TimeMode } from '../../hooks/useBroadcastSettings';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

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

    const inactive = 'border-border bg-surface-sunken/50 hover:border-secondary';
    const optionClass = (mode: TimeMode, active: string) =>
        `overflow-hidden rounded-xl border-2 transition-all ${timeMode === mode ? active : inactive}`;

    const radio = (selected: boolean, tone: 'on-air' | 'testing') => (
        <div className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${selected ? (tone === 'testing' ? 'border-testing-bright' : 'border-on-air-bright') : 'border-secondary'}`}>
            {selected && <div className={`h-2 w-2 rounded-full ${tone === 'testing' ? 'bg-testing-bright' : 'bg-on-air-bright'}`} />}
        </div>
    );

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-xs gap-0 p-0">
                <DialogHeader className="flex-row items-center gap-2 space-y-0 border-b border-border p-4">
                    <div className="rounded-full bg-on-air/20 p-1.5 text-on-air-bright">
                        <Clock size={16} />
                    </div>
                    <DialogTitle className="text-base font-bold text-heading">Time Settings</DialogTitle>
                </DialogHeader>

                <div className="space-y-2 p-4">
                    <div className={optionClass('time_now', 'border-on-air bg-on-air/10')}>
                        <button onClick={() => onTimeModeChange('time_now')} className="flex w-full items-start gap-3 p-3.5 text-left transition-colors">
                            {radio(timeMode === 'time_now', 'on-air')}
                            <div>
                                <div className={`text-sm font-semibold transition-colors ${timeMode === 'time_now' ? 'text-on-air-bright' : 'text-foreground'}`}>Time Now</div>
                                <div className="mt-0.5 text-[11px] leading-relaxed text-subtle-foreground">Broadcasts using the current system clock.</div>
                            </div>
                        </button>
                    </div>

                    <div className={optionClass('time_now_with_offset', 'border-on-air bg-on-air/10')}>
                        <button onClick={() => onTimeModeChange('time_now_with_offset')} className="flex w-full items-start gap-3 p-3.5 text-left transition-colors">
                            {radio(timeMode === 'time_now_with_offset', 'on-air')}
                            <div>
                                <div className={`text-sm font-semibold transition-colors ${timeMode === 'time_now_with_offset' ? 'text-on-air-bright' : 'text-foreground'}`}>Time Now with Offset</div>
                                <div className="mt-0.5 text-[11px] leading-relaxed text-subtle-foreground">Applies a global time offset to the current clock before broadcasting.</div>
                            </div>
                        </button>

                        {timeMode === 'time_now_with_offset' && (
                            <div className="animate-fade-in border-t border-on-air/30 bg-surface-sunken/60 px-3 pt-2.5 pb-3">
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">Time Offset</span>
                                    <div className="relative z-10 flex gap-1">
                                        <Button
                                            size="xs"
                                            variant={offsetSign === -1 ? 'softDanger' : 'outline'}
                                            onClick={(e) => { e.stopPropagation(); onOffsetSignChange(-1); }}
                                            className={`text-[10px] font-bold tracking-wide uppercase ${offsetSign === -1 ? 'border-offset-negative bg-offset-negative/20 text-offset-negative' : ''}`}
                                        >
                                            Behind
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant={offsetSign === 1 ? 'softSuccess' : 'outline'}
                                            onClick={(e) => { e.stopPropagation(); onOffsetSignChange(1); }}
                                            className={`text-[10px] font-bold tracking-wide uppercase ${offsetSign === 1 ? 'border-offset-positive bg-offset-positive/20 text-offset-positive' : ''}`}
                                        >
                                            Ahead
                                        </Button>
                                    </div>
                                </div>
                                <div className="mb-1.5 flex w-full items-center gap-1.5">
                                    <Input
                                        type="number"
                                        value={hours}
                                        onChange={(e) => setHours(clamp(e.target.value, 11, false))}
                                        className="min-w-0 flex-1 bg-surface-sunken/80 p-1.5 text-center font-mono text-base text-heading"
                                        placeholder="0"
                                    />
                                    <span className="shrink-0 text-xs font-bold text-subtle-foreground">h</span>
                                    <span className="shrink-0 font-bold text-faint-foreground">:</span>
                                    <Input
                                        type="number"
                                        value={minutes}
                                        onChange={(e) => setMinutes(clamp(e.target.value, 59, true))}
                                        className="min-w-0 flex-1 bg-surface-sunken/80 p-1.5 text-center font-mono text-base text-heading"
                                        placeholder="00"
                                    />
                                    <span className="shrink-0 text-xs font-bold text-subtle-foreground">m</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className={optionClass('fixed_time', 'border-testing bg-testing/10')}>
                        <button onClick={() => onTimeModeChange('fixed_time')} className="flex w-full items-start gap-3 p-3.5 text-left transition-colors">
                            {radio(timeMode === 'fixed_time', 'testing')}
                            <div>
                                <div className={`text-sm font-semibold transition-colors ${timeMode === 'fixed_time' ? 'text-testing-bright' : 'text-foreground'}`}>Fixed Time</div>
                                <div className="mt-0.5 text-[11px] leading-relaxed text-subtle-foreground">Transmits a specific fixed time signal. Useful for verifying hardware and syncing clocks from scratch.</div>
                            </div>
                        </button>
                        {timeMode === 'fixed_time' && (
                            <div className="animate-fade-in border-t border-testing/30 bg-surface-sunken/60 px-3 pt-2.5 pb-3">
                                <div className="flex items-center justify-center gap-2">
                                    <span className="shrink-0 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">Fixed Time</span>
                                    <Input
                                        type="time"
                                        value={fixedTime}
                                        onChange={(e) => onFixedTimeChange(e.target.value)}
                                        className="w-auto border-testing/50 bg-surface-sunken/80 p-1.5 text-center font-mono text-base text-testing-bright"
                                        required
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="border-t border-border p-4">
                    <Button
                        variant="secondary"
                        onClick={() => onSave(parseInt(hours) || 0, parseInt(minutes) || 0)}
                        disabled={saving}
                        className="w-full font-bold"
                    >
                        {saving ? 'Saving...' : 'Done'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
