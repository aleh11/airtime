import { Clock, RefreshCw, RotateCw, Settings, Zap } from 'lucide-react';
import { TimeModeBadge } from './TimeModeBadge';
import { TimeMode } from '../../hooks/useBroadcastSettings';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';

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

const ROW_CLASS = 'flex items-center justify-between rounded-lg border border-border/50 bg-muted/50 p-2';

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
            <h3 className="text-lg font-semibold text-card-foreground">System Control</h3>

            <div className={ROW_CLASS}>
                <div className="flex items-center gap-2.5">
                    <div className={`rounded-full p-1.5 ${ledsEnabled ? 'bg-success/20 text-success' : 'bg-secondary text-muted-foreground'}`}>
                        <Zap size={14} />
                    </div>
                    <div className="text-sm font-medium text-foreground">System LEDs</div>
                </div>

                <Switch
                    checked={ledsEnabled}
                    onCheckedChange={onToggleLeds}
                    aria-label="Toggle system LEDs"
                    className="data-[state=checked]:bg-success-strong"
                />
            </div>

            <button
                onClick={onOpenTimeSettings}
                className={`${ROW_CLASS} w-full cursor-pointer text-left transition-colors hover:bg-muted`}
            >
                <div className="flex items-center gap-2.5">
                    <div className="rounded-full bg-secondary p-1.5 text-on-air-bright">
                        <Clock size={14} />
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
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
                <Settings size={13} className="text-subtle-foreground" />
            </button>

            <div className="grid grid-cols-3 gap-2 pt-1">
                <Button variant="softAlt" size="sm" onClick={onRestartService} className="text-[10px] font-bold tracking-wide">
                    <RotateCw size={13} />
                    AIRTIME
                </Button>
                <Button variant="softDanger" size="sm" onClick={onRestartPi} className="text-[10px] font-bold tracking-wide">
                    <RotateCw size={13} />
                    PI
                </Button>
                <Button
                    variant="softPrimary"
                    size="sm"
                    onClick={onCheckUpdates}
                    disabled={isTransmitting}
                    className="text-[10px] font-bold tracking-wide"
                >
                    <RefreshCw size={13} />
                    UPDATE
                </Button>
            </div>
        </div>
    );
}
