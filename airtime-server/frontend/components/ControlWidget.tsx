import React, { useState, useEffect } from 'react';
import { Card } from './Card';
import { RadioConfig, RadioConfigInput } from '../types';
import { Play, Zap, X, Square, RotateCw, Clock, RefreshCw, Loader2, FlaskConical, HelpCircle, Settings } from 'lucide-react';
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
    activeService?: string | null;
    activeDuration?: number | null;
    remainingSeconds?: number;
    onTimeTesterChange?: (enabled: boolean, service: string) => void;
}

export const ControlWidget: React.FC<ControlWidgetProps> = ({
    radioConfig,
    onBroadcastStart,
    onCheckUpdates,
    isTransmitting = false,
    activeService,
    activeDuration,
    remainingSeconds = 0,
    onTimeTesterChange
}) => {
    const [selectedService, setSelectedService] = useState<string>('DCF77');
    const [duration, setDuration] = useState<number>(10);

    const [offsetHours, setOffsetHours] = useState<number>(0);
    const [offsetMinutes, setOffsetMinutes] = useState<number>(0);
    const [offsetSign, setOffsetSign] = useState<number>(1);
    const [offsetEnabled, setOffsetEnabled] = useState<boolean>(false);
    const [showOffsetModal, setShowOffsetModal] = useState<boolean>(false);
    const [offsetSaving, setOffsetSaving] = useState<boolean>(false);

    const [modalHours, setModalHours] = useState<string>('0');
    const [modalMinutes, setModalMinutes] = useState<string>('00');

    const [stealthMode, setStealthMode] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const [timeTesterEnabled, setTimeTesterEnabled] = useState<boolean>(false);
    const [timeTesterService, setTimeTesterService] = useState<string>('DCF77');
    const [timeTesterDuration, setTimeTesterDuration] = useState<12 | 24>(12);
    const [timeTesterLoading, setTimeTesterLoading] = useState<boolean>(false);
    const [showTimeTesterModal, setShowTimeTesterModal] = useState<boolean>(false);

    const [showTimeSettingsModal, setShowTimeSettingsModal] = useState<boolean>(false);
    const [timeMode, setTimeMode] = useState<'time_now' | 'time_now_with_offset' | 'fixed_time'>('time_now');

    const [countdown, setCountdown] = useState<number>(0);

    const [isRestarting, setIsRestarting] = useState<boolean>(false);
    const [restartType, setRestartType] = useState<'server' | 'pi' | null>(null);

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

    useEffect(() => {
        if (radioConfig) {
            setSelectedService(radioConfig.default_service);
            setDuration(radioConfig.default_duration_minutes);

            const totalMins = radioConfig.default_offset || 0;
            const h = Math.trunc(Math.abs(totalMins) / 60);
            const m = Math.abs(totalMins) % 60;

            setOffsetHours(h);
            setOffsetMinutes(m);
            setOffsetSign(totalMins >= 0 ? 1 : -1);
            setOffsetEnabled(radioConfig.default_offset_enabled ?? false);
        }
    }, [radioConfig]);

    // Load time tester state on mount
    useEffect(() => {
        api.getTimeTester().then(res => {
            setTimeTesterEnabled(res.enabled);
            if (res.service) {
                setTimeTesterService(res.service);
                onTimeTesterChange?.(res.enabled, res.service);
            }
        }).catch(() => { });
    }, []);

    // Keep timeTesterService in sync with selected service when tester is off
    useEffect(() => {
        if (!timeTesterEnabled) {
            setTimeTesterService(selectedService);
        }
    }, [selectedService, timeTesterEnabled]);

    useEffect(() => {
        if (showOffsetModal) {
            setModalHours(offsetHours.toString());
            setModalMinutes(offsetMinutes.toString().padStart(2, '0'));
        }
    }, [showOffsetModal, offsetHours, offsetMinutes]);

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

    const formatCountdown = (secs: number) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

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
                default_offset_enabled: true
            };
            await api.updateRadioConfig(config);

            setOffsetHours(h);
            setOffsetMinutes(m);
            setOffsetEnabled(true);
            setShowOffsetModal(false);

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
        e.stopPropagation();

        if (isTransmitting) {
            setModalConfig({
                isOpen: true,
                title: 'Broadcast Active',
                message: 'Cannot change offset settings while antenna is broadcasting. Please stop the broadcast first.',
                type: 'warning'
            });
            return;
        }

        const totalMinutes = offsetHours * 60 + offsetMinutes;

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
            setOffsetEnabled(!newState);
        }
    };

    const validateHours = (val: string) => {
        const num = parseInt(val);
        if (isNaN(num)) return setModalHours('');
        if (num < 0) return setModalHours('0');
        if (num > 11) return setModalHours('11');
        setModalHours(num.toString());
    };

    const validateMinutes = (val: string) => {
        const num = parseInt(val);
        if (isNaN(num)) return setModalMinutes('');
        if (num < 0) return setModalMinutes('00');
        if (num > 59) return setModalMinutes('59');
        setModalMinutes(num.toString().padStart(2, '0'));
    };

    const isNonZeroOffset = (parseInt(modalHours) > 0 || parseInt(modalMinutes) > 0);

    const handleTransmit = async () => {
        if (isTransmitting) {
            setLoading(true);
            try {
                // If time tester is active, use its stop path (re-enables crons)
                if (timeTesterEnabled) {
                    await api.setTimeTester(false, timeTesterService);
                    setTimeTesterEnabled(false);
                    onTimeTesterChange?.(false, timeTesterService);
                } else {
                    await api.stopTransmit();
                }
                onBroadcastStart();
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
            return;
        }

        setLoading(true);
        setSuccessMsg(null);
        try {
            await api.transmit({ service: selectedService, duration });
            onBroadcastStart();
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
            title: 'Restart Airtime',
            message: 'Are you sure you want to restart Airtime? This will restart the UI, System Monitor, and Server. Active broadcasts will be interrupted.',
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

    const totalStoredMinutes = offsetHours * 60 + offsetMinutes;
    const isStoredNonZero = totalStoredMinutes > 0;

    return (
        <>
            <Card title="Broadcast Control" className="h-full">
                <div className="space-y-1 -mt-2">
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
                    </div>



                    <div className="border-t border-slate-800/50 my-2"></div>

                    <div className="space-y-2">
                        <h3 className="text-slate-100 font-semibold text-lg">System Control</h3>

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

                        <button
                            onClick={() => setShowTimeSettingsModal(true)}
                            className="w-full flex items-center justify-between p-2 bg-slate-800/50 rounded-lg border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors text-left"
                        >
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 rounded-full bg-slate-700 text-cyan-400">
                                    <Clock size={14} />
                                </div>
                                <div className="text-sm font-medium text-slate-200">
                                    Time Settings
                                    <span className="ml-2 text-[10px] font-mono text-slate-500 uppercase">
                                        {timeMode === 'time_now' ? 'Now' : timeMode === 'time_now_with_offset' ? 'Offset' : 'Fixed'}
                                    </span>
                                </div>
                            </div>
                            <Settings size={13} className="text-slate-500" />
                        </button>

                        <div className="grid grid-cols-3 gap-2 pt-1">
                            <button
                                onClick={handleRestart}
                                className="flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold text-[10px] tracking-wide transition-all bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-lg shadow-purple-900/10"
                            >
                                <RotateCw size={13} />
                                AIRTIME
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
                                disabled={isTransmitting}
                                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold text-[10px] tracking-wide transition-all border shadow-lg ${isTransmitting
                                    ? 'bg-slate-800 text-slate-600 border-slate-700 shadow-none cursor-not-allowed opacity-50'
                                    : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/30 shadow-cyan-900/10'}`}
                            >
                                <RefreshCw size={13} />
                                UPDATE
                            </button>
                        </div>
                    </div>
                </div>
            </Card>

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

            {/* Time Settings Modal */}
            {showTimeSettingsModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowTimeSettingsModal(false)}>
                    <div className="bg-slate-800 rounded-2xl max-w-xs w-full border border-slate-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-slate-700">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-full bg-cyan-500/20 text-cyan-400">
                                    <Clock size={16} />
                                </div>
                                <h3 className="text-base font-bold text-white">Time Settings</h3>
                            </div>
                            <button onClick={() => setShowTimeSettingsModal(false)} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 transition-colors">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Radio Options */}
                        <div className="p-4 space-y-2">
                            {/* Time Now */}
                            <button
                                onClick={() => setTimeMode('time_now')}
                                className={`w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${timeMode === 'time_now'
                                        ? 'border-cyan-500 bg-cyan-500/10'
                                        : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
                                    }`}
                            >
                                <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${timeMode === 'time_now' ? 'border-cyan-400' : 'border-slate-600'
                                    }`}>
                                    {timeMode === 'time_now' && <div className="w-2 h-2 rounded-full bg-cyan-400" />}
                                </div>
                                <div>
                                    <div className={`text-sm font-semibold transition-colors ${timeMode === 'time_now' ? 'text-cyan-300' : 'text-slate-200'
                                        }`}>Time Now</div>
                                    <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">Broadcasts using the current system clock.</div>
                                </div>
                            </button>

                            {/* Time Now with Offset */}
                            <button
                                onClick={() => setTimeMode('time_now_with_offset')}
                                className={`w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${timeMode === 'time_now_with_offset'
                                        ? 'border-cyan-500 bg-cyan-500/10'
                                        : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
                                    }`}
                            >
                                <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${timeMode === 'time_now_with_offset' ? 'border-cyan-400' : 'border-slate-600'
                                    }`}>
                                    {timeMode === 'time_now_with_offset' && <div className="w-2 h-2 rounded-full bg-cyan-400" />}
                                </div>
                                <div>
                                    <div className={`text-sm font-semibold transition-colors ${timeMode === 'time_now_with_offset' ? 'text-cyan-300' : 'text-slate-200'
                                        }`}>Time Now with Offset</div>
                                    <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">Applies a global time offset to the current clock before broadcasting.</div>
                                </div>
                            </button>

                            {/* Fixed Time */}
                            <button
                                onClick={() => setTimeMode('fixed_time')}
                                className={`w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${timeMode === 'fixed_time'
                                        ? 'border-violet-500 bg-violet-500/10'
                                        : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
                                    }`}
                            >
                                <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${timeMode === 'fixed_time' ? 'border-violet-400' : 'border-slate-600'
                                    }`}>
                                    {timeMode === 'fixed_time' && <div className="w-2 h-2 rounded-full bg-violet-400" />}
                                </div>
                                <div>
                                    <div className={`text-sm font-semibold transition-colors ${timeMode === 'fixed_time' ? 'text-violet-300' : 'text-slate-200'
                                        }`}>Fixed Time</div>
                                    <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">Transmits a fixed 12:00 signal. Useful for verifying hardware and syncing clocks from scratch.</div>
                                </div>
                            </button>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-700">
                            <button
                                onClick={() => setShowTimeSettingsModal(false)}
                                className="w-full py-2.5 rounded-lg font-bold text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Time Tester Modal */}
            {showTimeTesterModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowTimeTesterModal(false)}>
                    <div className="bg-slate-800 rounded-2xl max-w-xs w-full border border-slate-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-slate-700">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-full bg-violet-500/20 text-violet-400">
                                    <FlaskConical size={16} />
                                </div>
                                <h3 className="text-base font-bold text-white">Time Tester</h3>
                            </div>
                            <button onClick={() => setShowTimeTesterModal(false)} className="p-2 hover:bg-slate-700 rounded-full text-slate-400">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="px-5 py-3 bg-violet-500/10 border-b border-violet-500/20">
                            <p className="text-[11px] text-violet-200/80 leading-relaxed">
                                Broadcasts a <strong className="text-violet-300">fixed 12:00 time signal</strong> for testing clocks and devices.
                                All scheduled cron jobs are paused for the duration and automatically restored when stopped.
                            </p>
                        </div>

                        <div className="p-5 space-y-4">
                            {/* Service picker */}
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Service</label>
                                <select
                                    value={timeTesterService}
                                    onChange={e => setTimeTesterService(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 text-sm font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent h-[40px]"
                                >
                                    {(radioConfig?.available_services ?? ['DCF77', 'WWVB', 'MSF', 'JJY40', 'JJY60']).map(svc => (
                                        <option key={svc} value={svc}>{svc}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Duration picker */}
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Duration</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {([12, 24] as const).map(h => (
                                        <button
                                            key={h}
                                            onClick={() => setTimeTesterDuration(h)}
                                            className={`py-2.5 rounded-lg font-bold text-sm border-2 transition-all ${timeTesterDuration === h
                                                ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                                                : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-violet-500/50'
                                                }`}
                                        >
                                            {h} hours
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-700 flex gap-3">
                            <button
                                onClick={() => setShowTimeTesterModal(false)}
                                className="flex-1 py-2.5 rounded-lg font-bold text-sm bg-slate-700 hover:bg-slate-600 text-slate-200"
                            >
                                Cancel
                            </button>
                            <button
                                disabled={timeTesterLoading}
                                onClick={async () => {
                                    setTimeTesterLoading(true);
                                    try {
                                        await api.setTimeTester(true, timeTesterService, timeTesterDuration);
                                        setTimeTesterEnabled(true);
                                        onTimeTesterChange?.(true, timeTesterService);
                                        setShowTimeTesterModal(false);
                                        onBroadcastStart();
                                    } catch (e) {
                                        console.error('Time tester error:', e);
                                    } finally {
                                        setTimeTesterLoading(false);
                                    }
                                }}
                                className="flex-1 py-2.5 rounded-lg font-bold text-sm bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {timeTesterLoading ? <Loader2 className="animate-spin" size={16} /> : <FlaskConical size={16} />}
                                Start
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
