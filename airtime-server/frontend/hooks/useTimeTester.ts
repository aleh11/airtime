import { useEffect, useState } from 'react';
import { api } from '../services/api';

/**
 * Owns the fixed-12:00 test broadcast, which suspends schedules while it runs.
 */
export function useTimeTester(onChange?: (enabled: boolean, standard: string) => void) {
    const [enabled, setEnabled] = useState(false);
    const [standard, setStandard] = useState('DCF77');
    const [durationHours, setDurationHours] = useState<12 | 24>(12);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        api.getTimeTester()
            .then((res) => {
                setEnabled(res.enabled);
                if (res.service) {
                    setStandard(res.service);
                    onChange?.(res.enabled, res.service);
                }
            })
            .catch(() => { });
    }, []);

    const start = async (): Promise<boolean> => {
        setBusy(true);
        try {
            await api.setTimeTester(true, standard, durationHours);
            setEnabled(true);
            onChange?.(true, standard);
            return true;
        } catch (e) {
            console.error('Failed to start the time tester', e);
            return false;
        } finally {
            setBusy(false);
        }
    };

    const stop = async () => {
        await api.setTimeTester(false, standard);
        setEnabled(false);
        onChange?.(false, standard);
    };

    return { enabled, standard, durationHours, busy, setStandard, setDurationHours, start, stop };
}
