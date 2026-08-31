import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { SystemMetrics, SystemStatus } from '../types';

const STATUS_INTERVAL_MS = 5000;
const METRICS_INTERVAL_MS = 2000;

export function useSystemStatus() {
    const [status, setStatus] = useState<SystemStatus | null>(null);
    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);

    const refresh = async () => {
        try {
            setStatus(await api.getStatus());
        } catch (e) {
            console.error('Status poll failed', e);
        }
    };

    useEffect(() => {
        refresh();

        const statusTimer = setInterval(refresh, STATUS_INTERVAL_MS);
        const metricsTimer = setInterval(async () => {
            try {
                setMetrics(await api.getSystemMetrics());
            } catch (e) {
                console.error('Metrics poll failed', e);
            }
        }, METRICS_INTERVAL_MS);

        return () => {
            clearInterval(statusTimer);
            clearInterval(metricsTimer);
        };
    }, []);

    return { status, metrics, refreshStatus: refresh };
}
