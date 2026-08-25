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
                <div className="flex h-32 animate-pulse items-center justify-center text-faint-foreground">
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
            <div className="mb-2 flex items-end justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase">
                    <Icon size={14} className={colorClass} /> {label}
                </div>
                <div className={`font-mono text-sm font-bold ${colorClass}`}>
                    {valueText}
                </div>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${bgClass}`}
                    style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                />
            </div>
        </div>
    );

    const getTempColor = (temp: number) => {
        if (temp < 50) return 'text-success';
        if (temp < 70) return 'text-offset-negative';
        return 'text-danger';
    };

    return (
        <Card title="System Statistics" className="h-full">
            <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <TopStat
                        icon={Cpu}
                        label="CPU"
                        valueText={`${metrics.cpu.percent}%`}
                        percent={metrics.cpu.percent}
                        colorClass="text-on-air-bright"
                        bgClass="bg-on-air"
                    />
                    <TopStat
                        icon={CircuitBoard}
                        label="RAM"
                        valueText={`${metrics.memory.percent}%`}
                        percent={metrics.memory.percent}
                        colorClass="text-accent-alt"
                        bgClass="bg-accent-alt-strong"
                    />
                </div>

                <div className="grid grid-cols-4 gap-4">
                    <div className="flex flex-col items-start gap-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-nowrap text-muted-foreground uppercase">
                            <Thermometer size={14} /> TEMP
                        </div>
                        <div className={`font-mono text-sm font-bold ${getTempColor(metrics.temperature)}`}>
                            {metrics.temperature > 0 ? `${metrics.temperature}°C` : 'N/A'}
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-nowrap text-muted-foreground uppercase">
                            <Radio size={14} /> NTP SYNC
                        </div>
                        <div className={`font-mono text-sm font-bold ${status?.ntp_status.synced ? 'text-success' : 'text-danger'}`}>
                            {status?.ntp_status.synced
                                ? formatTimeAgo(status.ntp_status.last_rx_seconds || 0)
                                : 'NO SYNC'}
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-nowrap text-muted-foreground uppercase">
                            <Globe size={14} /> PING
                        </div>
                        <div className={`font-mono text-sm font-bold ${status?.internet_status.connected ? 'text-on-air-bright' : 'text-danger'}`}>
                            {status?.internet_status.connected
                                ? `${Math.round(status.internet_status.ping_ms)}ms`
                                : 'OFFLINE'}
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 text-right">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-nowrap text-muted-foreground uppercase">
                            <Clock size={14} /> UPTIME
                        </div>
                        <div className="font-mono text-xs font-bold whitespace-nowrap text-foreground">
                            {formatUptime(metrics.uptime)}
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
}
