import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { CronJob, RadioConfig } from '../types';

/**
 * Owns the two pieces of state the dashboard edits: schedules and the radio
 * configuration they are encoded with.
 */
export function useDashboardData() {
    const [schedules, setSchedules] = useState<CronJob[]>([]);
    const [radioConfig, setRadioConfig] = useState<RadioConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setError(null);
        try {
            const [schedulesData, configData] = await Promise.all([
                api.getCrons(),
                api.getRadioConfig(),
            ]);
            setSchedules(schedulesData);
            setRadioConfig(configData);
        } catch (err: any) {
            console.error('Failed to fetch dashboard data', err);
            setError(err.message || 'Failed to connect to the AirTime daemon');
        } finally {
            setLoading(false);
        }
    }, []);

    const refreshSchedules = useCallback(async () => {
        try {
            setSchedules(await api.getCrons());
        } catch (e) {
            console.error('Failed to refresh schedules', e);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const retry = useCallback(() => {
        setLoading(true);
        refresh();
    }, [refresh]);

    return { schedules, radioConfig, loading, error, refresh, refreshSchedules, retry };
}
