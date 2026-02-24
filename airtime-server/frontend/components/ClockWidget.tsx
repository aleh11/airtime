import React, { useEffect, useState } from 'react';
import { Card } from './Card';
import { SystemStatus } from '../types';
import { RadioTower } from 'lucide-react';

const formatTimeAgo = (seconds: number): string => {
    if (seconds < 0) return '--';
    if (seconds < 60) return `${Math.floor(seconds)}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
};

interface ClockWidgetProps {
    status: SystemStatus | null;
    timeTesterEnabled?: boolean;
}

export const ClockWidget: React.FC<ClockWidgetProps> = ({ status, timeTesterEnabled = false }) => {
    const [displayTime, setDisplayTime] = useState<Date>(new Date());
    const [serverOffset, setServerOffset] = useState<number>(0);
    const [initDone, setInitDone] = useState(false);
    const [countdown, setCountdown] = useState<number>(0);

    useEffect(() => {
        if (status?.system_time) {
            const serverDate = new Date(status.system_time);
            const localDate = new Date();
            setServerOffset(serverDate.getTime() - localDate.getTime());
            if (!initDone) setInitDone(true);
        }
    }, [status]);

    useEffect(() => {
        const intervalId = setInterval(() => {
            setDisplayTime(new Date(new Date().getTime() + serverOffset));
            setCountdown(prev => Math.max(0, prev - 1));
        }, 1000);
        return () => clearInterval(intervalId);
    }, [serverOffset]);

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
    const offset = status?.services.txtempus_offset || 0;
    const offsetHours = Math.floor(Math.abs(offset) / 60);
    const offsetMinutes = Math.abs(offset) % 60;
    const offsetSign = offset >= 0 ? 1 : -1;
    const hasOffset = offset !== 0;
    const fixedTime = status?.services.txtempus_fixed_time || null;
    const isFixedTimeBroadcast = !!isTransmitting && !!fixedTime && !timeTesterEnabled;

    // colour tokens — cyan normally, violet for test mode or fixed-time broadcast
    const useViolet = timeTesterEnabled || isFixedTimeBroadcast;
    const c = useViolet ? {
        border: 'border-violet-500/50',
        borderSolid: 'border-violet-500/80',
        text: 'text-violet-500',
        glow: 'drop-shadow-[0_0_12px_rgba(139,92,246,0.9)]',
        ping: 'bg-violet-400',
        logoGlow: 'drop-shadow-[0_0_15px_rgba(139,92,246,0.7)]',
        iconBg: 'bg-violet-500/10 text-violet-400',
        countdown: 'text-violet-400',
    } : {
        border: 'border-cyan-500/50',
        borderSolid: 'border-cyan-500/80',
        text: 'text-cyan-500',
        glow: 'drop-shadow-[0_0_12px_rgba(6,182,212,0.9)]',
        ping: 'bg-cyan-400',
        logoGlow: 'drop-shadow-[0_0_15px_rgba(6,182,212,0.7)]',
        iconBg: 'bg-cyan-500/10 text-cyan-400',
        countdown: 'text-cyan-400',
    };

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

                {isTransmitting && (
                    <div className="flex items-center gap-6 animate-fade-in pr-4 pt-2">
                        <div className="relative px-2 py-1 md:px-4 md:py-1.5 hidden md:block">
                            <div className={`absolute inset-0 border-2 ${c.border} rounded blur-sm animate-pulse`}></div>
                            <div className={`absolute inset-0 border ${c.borderSolid} rounded`}></div>
                            <span className={`font-black ${c.text} tracking-widest text-xs md:text-2xl relative z-10 ${c.glow}`}>
                                ON AIR
                            </span>
                        </div>

                        <div className="relative">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${c.ping} opacity-75 duration-1000`}></span>
                            <img
                                src="/airtime-logo.png"
                                alt="Broadcasting"
                                className={`w-12 h-12 relative z-10 ${c.logoGlow} object-contain`}
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="pt-3 border-t border-slate-800 z-10 min-h-[50px] flex items-center">
                {isTransmitting ? (
                    <div className="w-full flex items-center justify-between animate-slide-up">
                        <div className="flex items-center gap-2">
                            <div className={`p-2 rounded ${c.iconBg}`}>
                                <RadioTower size={32} />
                            </div>
                            <div>
                                <div className="text-[12px] text-slate-400 font-bold uppercase tracking-wider">Transmitting</div>
                                <div className="text-2xl font-bold text-slate-200 flex items-center gap-2">
                                    {serviceName}
                                    {timeTesterEnabled && (
                                        <span className="text-[9px] font-bold text-violet-400 border border-violet-500/50 bg-violet-500/10 px-1 py-0 rounded-sm tracking-widest uppercase mt-0.5 ml-1">
                                            Testing
                                        </span>
                                    )}
                                    {isFixedTimeBroadcast && (
                                        <span className="text-[12px] font-mono font-bold px-2 py-0.5 rounded-full border text-violet-400 bg-violet-500/10 border-violet-500/30 ml-1">
                                            FIXED {fixedTime}
                                        </span>
                                    )}
                                    {hasOffset && !timeTesterEnabled && !isFixedTimeBroadcast && (
                                        <span className={`text-[12px] font-mono font-bold px-2 py-0.5 rounded-full border ${offsetSign > 0
                                            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                                            : 'text-orange-400 bg-orange-500/10 border-orange-500/30'} ml-1`}>
                                            {offsetSign > 0 ? '+' : '-'}{offsetHours > 0 ? `${offsetHours}h ` : ''}{offsetMinutes}m
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="text-right">
                            <div className="text-[12px] text-slate-400 font-bold uppercase tracking-wider">Remaining</div>
                            <div className={`text-3xl font-mono font-bold ${c.countdown} leading-none mt-0.5 drop-shadow-md`}>
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
        </Card>
    );
};
