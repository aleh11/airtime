import React from 'react';
import { SystemMetrics, SystemStatus } from '../types';
import { Card } from './Card';
import { Thermometer, Cpu, CircuitBoard, Clock, Globe, Radio } from 'lucide-react';

const formatTimeAgo = (seconds: number): string => {
    if (seconds < 0) return '--';
    if (seconds < 60) return `${Math.floor(seconds)}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
};

interface Props {
    metrics: SystemMetrics | null;
    status: SystemStatus | null;
}

export function PerformanceWidget({ metrics, status }: Props) {
    if (!metrics) {
        return (
            <Card title="System Performance">
                <div className="h-32 flex items-center justify-center text-slate-600 animate-pulse">
                    Loading...
                </div>
            </Card>
        );
    }

    const formatUptime = (seconds: number) => {
        const days = Math.floor(seconds / (3600 * 24));
        const hours = Math.floor((seconds % (3600 * 24)) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${days}d ${hours}h ${minutes}m`;
    };

    const TopStat = ({
        icon: Icon,
        label,
        valueText,
        percent,
        colorClass,
        bgClass
    }: {
        icon: any,
        label: string,
        valueText: React.ReactNode,
        percent: number,
        colorClass: string,
        bgClass: string
    }) => (
        <div className="flex flex-col justify-end">
            <div className="flex justify-between items-end mb-2">
                <div className="flex items-center gap-2 text-slate-400 font-medium text-xs uppercase">
                    <Icon size={14} className={colorClass} /> {label}
                </div>
                <div className={`font-mono font-bold ${colorClass} text-sm`}>
                    {valueText}
                </div>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${bgClass}`}
                    style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                />
            </div>
        </div>
    );

    const getTempColor = (temp: number) => {
        if (temp < 50) return "text-emerald-400";
        if (temp < 70) return "text-orange-400";
        return "text-red-500";
    };

    return (
        <Card title="System Statistics" className="h-full">
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <TopStat
                        icon={Cpu}
                        label="CPU"
                        valueText={`${metrics.cpu.percent}%`}
                        percent={metrics.cpu.percent}
                        colorClass="text-cyan-400"
                        bgClass="bg-cyan-500"
                    />
                    <TopStat
                        icon={CircuitBoard}
                        label="RAM"
                        valueText={`${metrics.memory.percent}%`}
                        percent={metrics.memory.percent}
                        colorClass="text-purple-400"
                        bgClass="bg-purple-500"
                    />
                </div>

                <div className="grid grid-cols-4 gap-4">
                    <div className="flex flex-col gap-1.5 items-start">
                        <div className="flex items-center gap-1.5 text-slate-400 font-medium text-xs uppercase text-nowrap">
                            <Thermometer size={14} /> TEMP
                        </div>
                        <div className={`font-mono font-bold text-sm ${getTempColor(metrics.temperature)}`}>
                            {metrics.temperature > 0 ? `${metrics.temperature}°C` : 'N/A'}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5 items-center">
                        <div className="flex items-center gap-1.5 text-slate-400 font-medium text-xs uppercase text-nowrap">
                            <Radio size={14} /> NTP SYNC
                        </div>
                        <div className={`font-mono font-bold text-sm ${status?.ntp_status.synced ? 'text-emerald-400' : 'text-red-400'}`}>
                            {status?.ntp_status.synced
                                ? formatTimeAgo(status.ntp_status.last_rx_seconds || 0)
                                : 'NO SYNC'}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5 items-center">
                        <div className="flex items-center gap-1.5 text-slate-400 font-medium text-xs uppercase text-nowrap">
                            <Globe size={14} /> PING
                        </div>
                        <div className={`font-mono font-bold text-sm ${status?.internet_status.connected ? 'text-cyan-400' : 'text-red-500'}`}>
                            {status?.internet_status.connected
                                ? `${Math.round(status.internet_status.ping_ms)}ms`
                                : 'OFFLINE'}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5 items-end text-right">
                        <div className="flex items-center gap-1.5 text-slate-400 font-medium text-xs uppercase text-nowrap">
                            <Clock size={14} /> UPTIME
                        </div>
                        <div className="font-mono font-bold text-xs text-slate-300 whitespace-nowrap">
                            {formatUptime(metrics.uptime)}
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
}
