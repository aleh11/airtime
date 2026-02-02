import React, { useEffect, useState } from 'react';
import { Card } from './Card';
import { SystemStatus } from '../types';
import { Radio, RadioTower } from 'lucide-react';

/**
 * Format seconds into human-readable "time ago" string
 */
const formatTimeAgo = (seconds: number): string => {
    if (seconds < 0) return '--';
    if (seconds < 60) return `${Math.floor(seconds)}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
};

interface ClockWidgetProps {
    status: SystemStatus | null;
}

export const ClockWidget: React.FC<ClockWidgetProps> = ({ status }) => {
    const [displayTime, setDisplayTime] = useState<Date>(new Date());
    const [serverOffset, setServerOffset] = useState<number>(0);
    const [initDone, setInitDone] = useState(false);
    const [countdown, setCountdown] = useState<number>(0);

    // 1. Sync Logic
    useEffect(() => {
        if (status?.system_time) {
            const serverDate = new Date(status.system_time);
            const localDate = new Date();
            const diff = serverDate.getTime() - localDate.getTime();
            setServerOffset(diff);
            if (!initDone) setInitDone(true);
        }
    }, [status]);

    // 2. High frequency tick
    useEffect(() => {
        const intervalId = setInterval(() => {
            const nowLocal = new Date().getTime();
            setDisplayTime(new Date(nowLocal + serverOffset));
            setCountdown(prev => Math.max(0, prev - 1));
        }, 1000);
        return () => clearInterval(intervalId);
    }, [serverOffset]);

    // Sync countdown
    useEffect(() => {
        if (status?.services.txtempus_remaining_seconds) {
            setCountdown(status.services.txtempus_remaining_seconds);
        } else if (!status?.services.txtempus_running) {
            setCountdown(0);
        }
    }, [status]);

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    };

    const formatCountdown = (secs: number) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const isTransmitting = status?.services.txtempus_running;
    const serviceName = status?.services.txtempus_service || 'Unknown';
    const ntpLastRx = status?.ntp_status.last_rx_seconds;

    return (
        <Card className="h-full flex flex-col justify-between relative overflow-hidden group">


            <div className="flex justify-between items-start mb-3 z-10">
                <div>
                    <div className="text-4xl md:text-5xl font-mono font-bold text-slate-50 tracking-tight leading-none mb-1">
                        {formatTime(displayTime)}
                    </div>
                    <div className="text-slate-400 font-medium text-xs">
                        {formatDate(displayTime)}
                    </div>
                </div>


                {/* ON AIR Indicator */}
                {isTransmitting && (
                    <div className="flex items-center gap-6 animate-fade-in pr-4 pt-2">
                        {/* Glowing Border + Text */}
                        <div className="relative px-2 py-1 md:px-4 md:py-1.5 hidden md:block">
                            <div className="absolute inset-0 border-2 border-cyan-500/50 rounded blur-sm animate-pulse"></div>
                            <div className="absolute inset-0 border border-cyan-500/80 rounded"></div>
                            <span className="font-black text-cyan-500 tracking-widest text-xs md:text-2xl relative z-10 drop-shadow-[0_0_12px_rgba(6,182,212,0.9)]">
                                ON AIR
                            </span>
                        </div>

                        {/* Radio Icon Pulsing */}
                        <div className="relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 duration-1000"></span>
                            <img
                                src="/airtime-logo.png"
                                alt="Broadcasting"
                                className="w-12 h-12 relative z-10 drop-shadow-[0_0_15px_rgba(6,182,212,0.7)] object-contain"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Area */}
            <div className="pt-3 border-t border-slate-800 z-10 min-h-[50px] flex items-center">
                {isTransmitting ? (
                    <div className="w-full flex items-center justify-between animate-slide-up">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded bg-cyan-500/10 text-cyan-400">
                                <RadioTower size={32} />
                            </div>
                            <div>
                                <div className="text-[12px] text-slate-400 font-bold uppercase tracking-wider">Transmitting</div>
                                <div className="text-2xl font-bold text-slate-200">{serviceName}</div>
                            </div>
                        </div>

                        <div className="text-right">
                            <div className="text-[12px] text-slate-400 font-bold uppercase tracking-wider">Remaining</div>
                            <div className="text-3xl font-mono font-bold text-cyan-400 leading-none mt-0.5 drop-shadow-md">
                                {formatCountdown(countdown)}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="w-full text-center text-slate-500 text-lg font-medium italic tracking-wide">
                        System Idle • Ready to Broadcast
                    </div>
                )}
            </div>
        </Card >
    );
};