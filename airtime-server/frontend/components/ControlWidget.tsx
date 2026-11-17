import { useState } from 'react';
import { Card } from './Card';
import { AlwaysOnStatus, RadioConfig } from '../types';
import { api } from '../services/api';
import { ConfirmModal, ModalType } from './ConfirmModal';
import { RestartOverlay } from './RestartOverlay';
import { BroadcastPanel } from './control/BroadcastPanel';
import { SystemControlPanel } from './control/SystemControlPanel';
import { TimeSettingsModal } from './control/TimeSettingsModal';
import { TimeTesterModal } from './control/TimeTesterModal';
import { useBroadcastSettings } from '../hooks/useBroadcastSettings';
import { useTimeTester } from '../hooks/useTimeTester';
import { useSystemActions } from '../hooks/useSystemActions';

const FALLBACK_STANDARDS = ['DCF77', 'WWVB', 'MSF', 'JJY40', 'JJY60'];

interface ControlWidgetProps {
    radioConfig: RadioConfig | null;
    onBroadcastStart: () => void;
    onCheckUpdates: () => void;
    onSettingsSaved?: () => void;
    isTransmitting?: boolean;
    activeService?: string | null;
    activeDuration?: number | null;
    remainingSeconds?: number;
    alwaysOn?: AlwaysOnStatus | null;
    onTimeTesterChange?: (enabled: boolean, service: string) => void;
}

interface Prompt {
    title: string;
    message: string;
    type: ModalType;
    confirmText?: string;
    onConfirm?: () => void;
}

export function ControlWidget({
    radioConfig,
    onBroadcastStart,
    onCheckUpdates,
    onSettingsSaved,
    isTransmitting = false,
    activeService,
    activeDuration,
    alwaysOn,
    onTimeTesterChange,
}: ControlWidgetProps) {
    const settings = useBroadcastSettings(radioConfig, onSettingsSaved);
    const tester = useTimeTester(onTimeTesterChange);
    const system = useSystemActions();

    const [ledsEnabled, setLedsEnabled] = useState(true);
    const [busy, setBusy] = useState(false);
    const [showTimeSettings, setShowTimeSettings] = useState(false);
    const [showTimeTester, setShowTimeTester] = useState(false);
    const [prompt, setPrompt] = useState<Prompt | null>(null);
    // "Always On" picked in the Duration list; local until it is started, so
    // the saved default duration stays a real duration.
    const [alwaysOnPicked, setAlwaysOnPicked] = useState(false);
    const standards = radioConfig?.available_services ?? FALLBACK_STANDARDS;
    const alwaysOnEnabled = !!alwaysOn?.enabled;
    const active = isTransmitting || alwaysOnEnabled;

    const run = async (action: () => Promise<unknown>) => {
        setBusy(true);
        try {
            await action();
            onBroadcastStart();
        } catch (e) {
            console.error('Broadcast control failed', e);
        } finally {
            setBusy(false);
        }
    };

    const toggleBroadcast = () => {
        if (alwaysOnEnabled) {
            setPrompt({
                title: 'Turn Off Always On?',
                message: 'The broadcast stops now and will not start again after a reboot. Paused schedules run again.',
                type: 'warning',
                confirmText: 'Turn Off',
                // Stop also turns Always On off on the daemon.
                onConfirm: () => run(() => api.stopTransmit()),
            });
            return;
        }
        if (!isTransmitting && alwaysOnPicked) {
            const fixedNote = settings.timeMode === 'fixed_time'
                ? '\n\nAlways On always sends the real time, not your fixed time.'
                : '';
            setPrompt({
                title: 'Start Always On?',
                message: `AirTime will transmit ${settings.standard} without an end, and start again by itself after every reboot or power cut, until you stop it.

Schedules are paused while it is on. It needs Wi-Fi or Ethernet to get the time, and waits until it has it.

Tip: a double press of the button on the unit also turns Always On on or off.${fixedNote}`,
                type: 'info',
                confirmText: 'Start Always On',
                onConfirm: () => run(async () => {
                    await api.setAlwaysOn(true, settings.standard);
                    setAlwaysOnPicked(false);
                }),
            });
            return;
        }
        run(async () => {
            if (!isTransmitting) {
                await api.transmit({ service: settings.standard, duration: settings.duration });
            } else if (tester.enabled) {
                // The tester has its own stop path, which restores the schedules
                // it suspended.
                await tester.stop();
            } else {
                await api.stopTransmit();
            }
        });
    };

    const toggleLeds = async () => {
        try {
            const res = await api.toggleStealth();
            setLedsEnabled(!res.stealth_mode);
        } catch (e) {
            console.error('Failed to toggle the LEDs', e);
        }
    };

    const confirmRestart = (target: 'service' | 'pi') => {
        setPrompt(target === 'pi'
            ? {
                title: 'Reboot System',
                message: 'Reboot the Raspberry Pi? The system will be offline for roughly a minute.',
                type: 'danger',
                confirmText: 'Reboot',
                onConfirm: () => system.restart('pi'),
            }
            : {
                title: 'Restart AirTime',
                message: 'Restart AirTime? Any active broadcast will be interrupted.',
                type: 'warning',
                confirmText: 'Restart',
                onConfirm: () => system.restart('service'),
            });
    };

    return (
        <>
            <Card title="Broadcast Control" className="h-full">
                <div className="space-y-1 -mt-2">
                    <BroadcastPanel
                        standards={standards}
                        standard={settings.standard}
                        duration={settings.duration}
                        alwaysOnPicked={alwaysOnPicked}
                        alwaysOn={alwaysOn}
                        fixedTimeMode={settings.timeMode === 'fixed_time'}
                        isTransmitting={isTransmitting}
                        activeStandard={activeService}
                        activeDuration={activeDuration}
                        busy={busy}
                        onChange={settings.saveDefaults}
                        onPickAlwaysOn={setAlwaysOnPicked}
                        onToggleBroadcast={toggleBroadcast}
                    />

                    <div className="my-2 border-t border-muted/50" />

                    <SystemControlPanel
                        ledsEnabled={ledsEnabled}
                        isTransmitting={active}
                        timeMode={settings.timeMode}
                        fixedTime={settings.fixedTime}
                        offsetEnabled={settings.offsetEnabled}
                        offsetHours={settings.offsetHours}
                        offsetMinutes={settings.offsetMinutes}
                        offsetSign={settings.offsetSign}
                        onToggleLeds={toggleLeds}
                        onOpenTimeSettings={() => {
                            if (active) {
                                setPrompt({
                                    title: 'Control Locked',
                                    message: alwaysOnEnabled
                                        ? "You can't change time settings while Always On is enabled."
                                        : "You can't change time settings while broadcasting.",
                                    type: 'warning',
                                });
                                return;
                            }
                            setShowTimeSettings(true);
                        }}
                        onRestartService={() => confirmRestart('service')}
                        onRestartPi={() => confirmRestart('pi')}
                        onCheckUpdates={onCheckUpdates}
                    />
                </div>
            </Card>

            {showTimeSettings && (
                <TimeSettingsModal
                    timeMode={settings.timeMode}
                    fixedTime={settings.fixedTime}
                    offsetHours={settings.offsetHours}
                    offsetMinutes={settings.offsetMinutes}
                    offsetSign={settings.offsetSign}
                    saving={settings.saving}
                    onTimeModeChange={settings.setTimeMode}
                    onFixedTimeChange={settings.setFixedTime}
                    onOffsetSignChange={settings.setOffsetSign}
                    onClose={() => setShowTimeSettings(false)}
                    onSave={async (hours, minutes) => {
                        const saved = await settings.saveTimeMode(hours, minutes);
                        if (saved) {
                            setShowTimeSettings(false);
                            return;
                        }
                        setPrompt({ title: 'Error', message: 'Failed to save time settings.', type: 'danger' });
                    }}
                />
            )}

            {showTimeTester && (
                <TimeTesterModal
                    standards={standards}
                    standard={tester.standard}
                    durationHours={tester.durationHours}
                    busy={tester.busy}
                    onStandardChange={tester.setStandard}
                    onDurationChange={tester.setDurationHours}
                    onClose={() => setShowTimeTester(false)}
                    onStart={async () => {
                        if (await tester.start()) {
                            setShowTimeTester(false);
                            onBroadcastStart();
                        }
                    }}
                />
            )}

            {system.restarting && (
                <RestartOverlay
                    title={system.restarting === 'pi' ? 'Rebooting Pi' : 'Restarting AirTime'}
                    message={system.restarting === 'pi'
                        ? 'Waiting for the Raspberry Pi to come back online. This may take up to a minute.'
                        : 'Waiting for the daemon to restart. This should only take a few seconds.'}
                    hint="Polling for connection"
                />
            )}

            <ConfirmModal
                isOpen={prompt !== null}
                onClose={() => setPrompt(null)}
                onConfirm={prompt?.onConfirm}
                title={prompt?.title ?? ''}
                message={prompt?.message ?? ''}
                type={prompt?.type ?? 'info'}
                confirmText={prompt?.confirmText}
            />
        </>
    );
}
