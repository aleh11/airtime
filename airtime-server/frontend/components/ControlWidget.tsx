import React, { useState, useEffect } from 'react';
import { Card } from './Card';
import { RadioConfig, TransmitRequest, RadioConfigInput } from '../types';
import { Play, Check, Zap, Settings, X, Square, RotateCw, Clock, RefreshCw, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { ConfirmModal, ModalType } from './ConfirmModal';

const DURATION_OPTIONS = [
    { label: '10 min', value: 10 },
    { label: '20 min', value: 20 },
    { label: '30 min', value: 30 },
    { label: '1 hr', value: 60 },
    { label: '2 hr', value: 120 },
    { label: '4 hr', value: 240 },
    { label: '6 hr', value: 360 },
];

interface ControlWidgetProps {
    radioConfig: RadioConfig | null;
    onBroadcastStart: () => void;
    onCheckUpdates: () => void;
    isTransmitting?: boolean;
    // New props from extended status
    activeService?: string | null;
    activeDuration?: number | null;
    remainingSeconds?: number;
}

export const ControlWidget: React.FC<ControlWidgetProps> = ({
    radioConfig,
    onBroadcastStart,
    onCheckUpdates,
    isTransmitting = false,
    activeService,
    activeDuration,
    remainingSeconds = 0
}) => {
    // Current UI Selection (also mirrors backend config)
    const [selectedService, setSelectedService] = useState<string>('DCF77');
    const [duration, setDuration] = useState<number>(10);

    // Global Offset State
    const [offsetHours, setOffsetHours] = useState<number>(0);
    const [offsetMinutes, setOffsetMinutes] = useState<number>(0);
    const [offsetSign, setOffsetSign] = useState<number>(1); // 1 for Ahead, -1 for Behind
    const [offsetEnabled, setOffsetEnabled] = useState<boolean>(false);
    const [showOffsetModal, setShowOffsetModal] = useState<boolean>(false);
    const [offsetSaving, setOffsetSaving] = useState<boolean>(false);

    // Filtered internal state for the modal inputs
    const [modalHours, setModalHours] = useState<string>('0');
    const [modalMinutes, setModalMinutes] = useState<string>('00');

    // UI State
    const [stealthMode, setStealthMode] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Countdown State
    const [countdown, setCountdown] = useState<number>(0);

    // Restart state
    const [isRestarting, setIsRestarting] = useState<boolean>(false);
    const [restartType, setRestartType] = useState<'server' | 'pi' | null>(null);

    // Modal State
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: ModalType;
        onConfirm?: () => void;
        confirmText?: string;
        cancelText?: string;
    }>({ isOpen: false, title: '', message: '', type: 'info' });

    const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

    // Initial load from config
    useEffect(() => {
        if (radioConfig) {
            setSelectedService(radioConfig.default_service);
            setDuration(radioConfig.default_duration_minutes);

            const totalMins = radioConfig.default_offset || 0;
            const h = Math.trunc(Math.abs(totalMins) / 60);
            const m = Math.abs(totalMins) % 60;
            const sign = totalMins >= 0 ? 1 : -1;

            setOffsetHours(h);
            setOffsetMinutes(m);
            setOffsetSign(sign);
            setOffsetEnabled(radioConfig.default_offset_enabled ?? false);
        }
    }, [radioConfig]);

    // Update modal inputs when opening
    useEffect(() => {
        if (showOffsetModal) {
            setModalHours(offsetHours.toString());
            setModalMinutes(offsetMinutes.toString().padStart(2, '0'));
        }
    }, [showOffsetModal, offsetHours, offsetMinutes]);

    // Countdown Timer logic
    useEffect(() => {
        if (isTransmitting && remainingSeconds > 0) {
            setCountdown(remainingSeconds);
            const interval = setInterval(() => {
                setCountdown(prev => Math.max(0, prev - 1));
            }, 1000);
            return () => clearInterval(interval);
        } else {
            setCountdown(0);
        }
    }, [isTransmitting, remainingSeconds]);

    // ... formatCountdown ...
    const formatCountdown = (secs: number) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // Auto-update backend config when dropdowns change
    const updateConfig = async (service: string, dur: number) => {
        setSelectedService(service);
        setDuration(dur);
        try {
            const config: RadioConfigInput = {
                default_service: service,
                default_duration_minutes: dur,
                default_offset: radioConfig?.default_offset || 0,
                default_offset_enabled: offsetEnabled
            };
            await api.updateRadioConfig(config);
        } catch (e) {
            console.error("Failed to update radio config defaults", e);
        }
    };

    const handleSaveOffset = async () => {
        setOffsetSaving(true);
        try {
            const h = parseInt(modalHours) || 0;
            const m = parseInt(modalMinutes) || 0;
            const totalAbsMinutes = (h * 60) + m;
            const totalMinutes = totalAbsMinutes * offsetSign;

            const config: RadioConfigInput = {
                default_service: selectedService,
                default_duration_minutes: duration,
                default_offset: totalMinutes,
                default_offset_enabled: true // Auto-enable when saving new value
            };
            await api.updateRadioConfig(config);

            // Update local state
            setOffsetHours(h);
            setOffsetMinutes(m);
            setOffsetEnabled(true);

            setShowOffsetModal(false);
            // setSuccessMsg(`Global Offset set to ${totalMinutes > 0 ? '+' : ''}${totalMinutes}m`);
            // setTimeout(() => setSuccessMsg(null), 3000);

            // Trigger refresh so app gets new config
            onBroadcastStart();
        } catch (e) {
            console.error(e);
            setModalConfig({
                isOpen: true,
                title: 'Error',
                message: 'Failed to save offset settings.',
                type: 'danger'
            });
        } finally {
            setOffsetSaving(false);
        }
    };

    const handleOffsetToggle = async (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent opening modal

        // Block toggle if transmitting
        if (isTransmitting) {
            setModalConfig({
                isOpen: true,
                title: 'Broadcast Active',
                message: 'Cannot change offset settings while antenna is broadcasting. Please stop the broadcast first.',
                type: 'warning'
            });
            return;
        }

        const totalMinutes = (offsetHours * 60 + offsetMinutes);

        // If enabling but value is 0, open modal instead of just enabling "0 offset" which does nothing
        if (!offsetEnabled && totalMinutes === 0) {
            setShowOffsetModal(true);
            return;
        }

        const newState = !offsetEnabled;
        setOffsetEnabled(newState);
        try {
            const config: RadioConfigInput = {
                default_service: selectedService,
                default_duration_minutes: duration,
                default_offset: (offsetHours * 60 + offsetMinutes) * offsetSign,
                default_offset_enabled: newState
            };
            await api.updateRadioConfig(config);
        } catch (e) {
            console.error(e);
            setOffsetEnabled(!newState); // Revert on error
        }
    };

    const validateHours = (val: string) => {
        // limit 0-11
        const num = parseInt(val);
        if (isNaN(num)) return setModalHours('');
        if (num < 0) return setModalHours('0');
        if (num > 11) return setModalHours('11');
        setModalHours(num.toString());
    };

    const validateMinutes = (val: string) => {
        // limit 0-59
        const num = parseInt(val);
        if (isNaN(num)) return setModalMinutes('');
        if (num < 0) return setModalMinutes('00');
        if (num > 59) return setModalMinutes('59');
        setModalMinutes(num.toString().padStart(2, '0')); // Keep leading zero for UX
    };

    const isNonZeroOffset = (parseInt(modalHours) > 0 || parseInt(modalMinutes) > 0);

    const handleTransmit = async () => {
        if (isTransmitting) {
            setLoading(true);
            try {
                await api.stopTransmit();
                onBroadcastStart();
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
            return;
        }

        setLoading(true);
        setSuccessMsg(null);
        try {
            const req: TransmitRequest = {
                service: selectedService,
                duration: duration
            };
            await api.transmit(req);
            // const durationLabel = DURATION_OPTIONS.find(opt => opt.value === duration)?.label || `${duration}m`;
            // setSuccessMsg(`Broadcasting ${selectedService} for ${durationLabel}`);
            onBroadcastStart();
            // setTimeout(() => setSuccessMsg(null), 3000);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleStealthToggle = async () => {
        try {
            const res = await api.toggleStealth();
            setStealthMode(res.stealth_mode);
        } catch (e) { console.error(e); }
    };

    const pollUntilOnline = async () => {
        const maxAttempts = 60;
        let attempts = 0;
        while (attempts < maxAttempts) {
            try {
                await api.getStatus();
                return true;
            } catch (e) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                attempts++;
            }
        }
        return false;
    };

    const handleRestart = async () => {
        setModalConfig({
            isOpen: true,
            title: 'Restart Server',
            message: 'Are you sure you want to restart the Airtime server? Broadcasts will be interrupted.',
            type: 'warning',
            confirmText: 'Restart',
            onConfirm: async () => {
                setIsRestarting(true);
                setRestartType('server');
                try {
                    await api.restartServer();
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    const online = await pollUntilOnline();
                    if (online) {
                        setSuccessMsg('Server restarted successfully');
                        setTimeout(() => {
                            setSuccessMsg(null);
                            window.location.reload();
                        }, 1000);
                    } else {
                        setModalConfig({
                            isOpen: true,
                            title: 'Timeout',
                            message: 'Server restart timeout. Please check services manually.',
                            type: 'danger'
                        });
                    }
                } catch (e) {
                    console.error(e);
                    setModalConfig({
                        isOpen: true,
                        title: 'Error',
                        message: 'Failed to restart server.',
                        type: 'danger'
                    });
                }
                finally { setIsRestarting(false); setRestartType(null); }
            }
        });
    };

    const handleRestartPi = async () => {
        setModalConfig({
            isOpen: true,
            title: 'Reboot System',
            message: 'Are you sure you want to reboot the Raspberry Pi? The system will go offline for roughly 1 minute.',
            type: 'danger',
            confirmText: 'Reboot',
            onConfirm: async () => {
                setIsRestarting(true);
                setRestartType('pi');
                try {
                    await api.restartPi();
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    const online = await pollUntilOnline();
                    if (online) {
                        setSuccessMsg('Pi rebooted successfully');
                        setTimeout(() => setSuccessMsg(null), 3000);
                    } else {
                        // Usually expected for Pi reboot to take longer or require refresh
                        setModalConfig({
                            isOpen: true,
                            title: 'Rebooting',
                            message: 'System is rebooting. Please wait and refresh the page manually if it does not come back.',
                            type: 'info'
                        });
                    }
                } catch (e) {
                    console.error(e);
                    setModalConfig({
                        isOpen: true,
                        title: 'Error',
                        message: 'Failed to reboot Pi.',
                        type: 'danger'
                    });
                }
                finally { setIsRestarting(false); setRestartType(null); }
            }
        });
    };

    // Derived state for offset display
    const totalStoredMinutes = offsetHours * 60 + offsetMinutes;
    const isStoredNonZero = totalStoredMinutes > 0;
    const canToggle = isStoredNonZero;
    const appliedMinutes = (totalStoredMinutes * offsetSign);

    return (
        <>
            <Card title="Broadcast Control" className="h-full">
                <div className="space-y-1 -mt-2">

                    {/* Broadcast Form */}
                    <div className="space-y-1 pb-1">
                        <div className="flex gap-2 items-end mb-2">
                            <div className="flex-1 space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Service</label>
                                <select
                                    value={isTransmitting ? (activeService || selectedService) : selectedService}
                                    onChange={(e) => updateConfig(e.target.value, duration)}
                                    disabled={isTransmitting}
                                    className={`w-full bg-slate-900 border border-slate-700 rounded-lg px-3 text-sm font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent h-[40px] ${isTransmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {radioConfig?.available_services.map(svc => (
                                        <option key={svc} value={svc}>{svc}</option>
                                    ))}
                                    {!radioConfig && <option value="DCF77">DCF77</option>}
                                </select>
                            </div>
                            <div className="flex-1 space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Duration</label>
                                <select
                                    value={isTransmitting ? (activeDuration || duration) : duration}
                                    onChange={(e) => updateConfig(selectedService, parseInt(e.target.value))}
                                    disabled={isTransmitting}
                                    className={`w-full bg-slate-900 border border-slate-700 rounded-lg px-3 text-sm font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent h-[40px] ${isTransmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {DURATION_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                            {/* Removed settings button from default place */}
                        </div>

                        {isTransmitting ? (
                            <button
                                onClick={handleTransmit}
                                disabled={loading}
                                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm transition-all shadow-lg bg-red-600 hover:bg-red-500 text-white shadow-red-900/20"
                            >
                                {loading ? <Loader2 className="animate-spin" size={16} /> : <Square size={16} fill="currentColor" />}
                                STOP BROADCAST
                            </button>
                        ) : (
                            <button
                                onClick={handleTransmit}
                                disabled={loading}
                                className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm transition-all shadow-lg ${loading
                                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                    : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/20'
                                    }`}
                            >
                                {loading ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} fill="currentColor" />}
                                {loading ? 'STARTING...' : 'BROADCAST NOW'}
                            </button>
                        )}

                        {/* Success Message Removed per user request */}
                        {/* {successMsg && (
                            <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 p-2 rounded justify-center animate-fade-in">
                                <Check size={12} /> {successMsg}
                            </div>
                        )} */}
                    </div>

                    {/* divider */}
                    <div className="border-t border-slate-800/50 my-2"></div>

                    {/* System Control Section */}
                    <div className="space-y-2">
                        <h3 className="text-slate-100 font-semibold text-lg">System Control</h3>

                        {/* System LEDs / Stealth */}
                        <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
                            <div className="flex items-center gap-2.5">
                                <div className={`p-1.5 rounded-full ${!stealthMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                                    <Zap size={14} />
                                </div>
                                <div className="text-sm font-medium text-slate-200">System LEDs</div>
                            </div>

                            <button
                                onClick={handleStealthToggle}
                                className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-200 ease-in-out relative inline-flex items-center ${!stealthMode ? 'bg-emerald-500/80' : 'bg-slate-600'}`}
                            >
                                <div className={`bg-white w-3 h-3 rounded-full shadow transform transition-transform duration-200 ${!stealthMode ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {/* Global Offset */}
                        <div
                            onClick={() => {
                                if (isTransmitting) {
                                    setModalConfig({
                                        isOpen: true,
                                        title: 'Broadcast Active',
                                        message: 'Cannot edit offset settings while antenna is broadcasting. Please stop the broadcast first.',
                                        type: 'warning'
                                    });
                                } else {
                                    setShowOffsetModal(true);
                                }
                            }}
                            className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors"
                        >
                            <div className="flex items-center gap-2.5">
                                <div className={`p-1.5 rounded-full ${offsetEnabled && isStoredNonZero ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700 text-slate-400'}`}>
                                    <Clock size={14} />
                                </div>
                                <div className="text-sm font-medium text-slate-200">
                                    Global Offset
                                    {isStoredNonZero && (
                                        <span className={`ml-2 text-xs font-mono font-bold ${offsetEnabled ? 'text-cyan-400' : 'text-slate-500'}`}>
                                            {offsetSign > 0 ? '+' : '-'}{totalStoredMinutes}m
                                        </span>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={handleOffsetToggle}
                                className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-200 ease-in-out relative inline-flex items-center ${offsetEnabled && isStoredNonZero ? 'bg-cyan-500/80' : 'bg-slate-600'}`}
                            >
                                <div className={`bg-white w-3 h-3 rounded-full shadow transform transition-transform duration-200 ${offsetEnabled && isStoredNonZero ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {/* Restart Buttons */}
                        <div className="grid grid-cols-3 gap-2 pt-1">
                            <button
                                onClick={handleRestart}
                                className="flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold text-[10px] tracking-wide transition-all bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-lg shadow-purple-900/10"
                            >
                                <RotateCw size={13} />
                                SERVER
                            </button>
                            <button
                                onClick={handleRestartPi}
                                className="flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold text-[10px] tracking-wide transition-all bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 shadow-lg shadow-red-900/10"
                            >
                                <RotateCw size={13} />
                                PI
                            </button>
                            <button
                                onClick={onCheckUpdates}
                                className="flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold text-[10px] tracking-wide transition-all bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-lg shadow-cyan-900/10"
                            >
                                <RefreshCw size={13} />
                                UPDATE
                            </button>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Global Offset Modal */}
            {showOffsetModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowOffsetModal(false)}>
                    <div className="bg-slate-800 rounded-2xl max-w-xs w-full border border-slate-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-slate-700">
                            <h3 className="text-base font-bold text-white">Global Time Offset</h3>
                            <button onClick={() => setShowOffsetModal(false)} className="p-2 hover:bg-slate-700 rounded-full text-slate-400">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="px-6 py-4 bg-yellow-500/10 border-b border-yellow-500/20">
                            <p className="text-[11px] text-yellow-200/90 leading-relaxed text-center">
                                <strong className="text-yellow-400">WARNING:</strong> Modifying this will apply the offset to <span className="underline decoration-yellow-500/50">EVERYTHING</span> (Scheduled Crons, Manual Broadcasts, and UI Button events).
                            </p>
                        </div>

                        <div className="p-6 flex flex-col items-center">
                            <div className="flex items-end gap-2 mb-6">
                                <div className="text-center">
                                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Hours</label>
                                    <input
                                        type="number"
                                        value={modalHours}
                                        onChange={e => validateHours(e.target.value)}
                                        className="w-20 bg-slate-900 border border-slate-600 rounded-lg p-3 text-2xl font-mono text-center text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                                        placeholder="0"
                                    />
                                </div>
                                <div className="text-2xl text-slate-600 font-bold pb-3">:</div>
                                <div className="text-center">
                                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Mins</label>
                                    <input
                                        type="number"
                                        value={modalMinutes}
                                        onChange={e => validateMinutes(e.target.value)}
                                        className="w-20 bg-slate-900 border border-slate-600 rounded-lg p-3 text-2xl font-mono text-center text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                                        placeholder="00"
                                    />
                                </div>
                            </div>

                            {isNonZeroOffset ? (
                                <div className="flex w-full gap-2 mb-2 animate-fade-in">
                                    <button
                                        onClick={() => setOffsetSign(-1)}
                                        className={`flex-1 py-2 rounded-lg font-bold text-xs uppercase tracking-wide border-2 transition-all ${offsetSign === -1
                                            ? 'border-orange-500 bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                                            : 'border-slate-700 bg-slate-800 text-slate-500 hover:border-orange-500/50'
                                            }`}
                                    >
                                        Behind (-)
                                    </button>
                                    <button
                                        onClick={() => setOffsetSign(1)}
                                        className={`flex-1 py-2 rounded-lg font-bold text-xs uppercase tracking-wide border-2 transition-all ${offsetSign === 1
                                            ? 'border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                            : 'border-slate-700 bg-slate-800 text-slate-500 hover:border-emerald-500/50'
                                            }`}
                                    >
                                        Ahead (+)
                                    </button>
                                </div>
                            ) : (
                                <div className="text-xs text-slate-500 h-[36px] flex items-center justify-center italic">
                                    No offset applied
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-slate-700 flex gap-3">
                            <button
                                onClick={handleSaveOffset}
                                disabled={offsetSaving}
                                className="w-full py-3 rounded-lg font-bold text-sm bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                            >
                                {offsetSaving ? 'Saving...' : 'Apply Offset'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Restart Loading Modal */}
            {isRestarting && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-slate-800 rounded-2xl p-8 max-w-sm w-full border border-slate-700 shadow-2xl text-center">
                        <div className="mb-6">
                            <RotateCw size={48} className={`mx-auto animate-spin ${restartType === 'pi' ? 'text-red-400' : 'text-purple-400'}`} />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-3">
                            {restartType === 'pi' ? 'Rebooting Pi...' : 'Restarting Server...'}
                        </h3>
                        <p className="text-sm text-slate-400 mb-6">
                            {restartType === 'pi'
                                ? 'Waiting for Raspberry Pi to come back online. This may take up to a minute.'
                                : 'Waiting for server to restart. This should only take a few seconds.'}
                        </p>
                        <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                            <div className="animate-pulse">Polling for connection</div>
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={modalConfig.isOpen}
                onClose={closeModal}
                onConfirm={modalConfig.onConfirm}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                confirmText={modalConfig.confirmText}
                cancelText={modalConfig.cancelText}
            />
        </>
    );
};

const ActivityIcon = ({ className }: { className?: string }) => (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
);
