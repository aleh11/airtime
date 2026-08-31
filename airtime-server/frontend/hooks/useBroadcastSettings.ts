import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { RadioConfig, RadioConfigInput } from '../types';

export type TimeMode = 'time_now' | 'time_now_with_offset' | 'fixed_time';

/**
 * Owns how a broadcast is encoded: which standard, for how long, and against
 * what clock. Every change is written straight back to the daemon, which is the
 * only source of truth for these values.
 */
export function useBroadcastSettings(radioConfig: RadioConfig | null, onSaved?: () => void) {
    const [standard, setStandard] = useState('DCF77');
    const [duration, setDuration] = useState(10);
    const [offsetHours, setOffsetHours] = useState(0);
    const [offsetMinutes, setOffsetMinutes] = useState(0);
    const [offsetSign, setOffsetSign] = useState(1);
    const [offsetEnabled, setOffsetEnabled] = useState(false);
    const [timeMode, setTimeMode] = useState<TimeMode>('time_now');
    const [fixedTime, setFixedTime] = useState('12:00');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!radioConfig) return;

        setStandard(radioConfig.default_service);
        setDuration(radioConfig.default_duration_minutes);

        const totalMinutes = radioConfig.default_offset || 0;
        setOffsetHours(Math.trunc(Math.abs(totalMinutes) / 60));
        setOffsetMinutes(Math.abs(totalMinutes) % 60);
        setOffsetSign(totalMinutes >= 0 ? 1 : -1);
        setOffsetEnabled(radioConfig.default_offset_enabled ?? false);
        setTimeMode((radioConfig.default_time_mode as TimeMode) || 'time_now');
        setFixedTime(radioConfig.default_fixed_time || '12:00');
    }, [radioConfig]);

    const saveDefaults = async (nextStandard: string, nextDuration: number) => {
        setStandard(nextStandard);
        setDuration(nextDuration);
        try {
            await api.updateRadioConfig({
                default_service: nextStandard,
                default_duration_minutes: nextDuration,
                default_offset: radioConfig?.default_offset || 0,
                default_offset_enabled: offsetEnabled,
            });
        } catch (e) {
            console.error('Failed to save broadcast defaults', e);
        }
    };

    /** Persists the time mode chosen in the settings modal. */
    const saveTimeMode = async (hours: number, minutes: number): Promise<boolean> => {
        setSaving(true);
        try {
            const config: RadioConfigInput = {
                default_service: standard,
                default_duration_minutes: duration,
                default_offset: 0,
                default_offset_enabled: false,
                default_time_mode: timeMode,
                default_fixed_time: fixedTime,
            };

            if (timeMode === 'time_now_with_offset') {
                config.default_offset = (hours * 60 + minutes) * offsetSign;
                config.default_offset_enabled = true;
                await api.updateRadioConfig(config);
                setOffsetHours(hours);
                setOffsetMinutes(minutes);
                setOffsetEnabled(true);
            } else {
                config.default_offset = (offsetHours * 60 + offsetMinutes) * offsetSign;
                await api.updateRadioConfig(config);
                setOffsetEnabled(false);
            }

            onSaved?.();
            return true;
        } catch (e) {
            console.error('Failed to save time settings', e);
            return false;
        } finally {
            setSaving(false);
        }
    };

    return {
        standard,
        duration,
        offsetHours,
        offsetMinutes,
        offsetSign,
        offsetEnabled,
        timeMode,
        fixedTime,
        saving,
        setOffsetSign,
        setTimeMode,
        setFixedTime,
        saveDefaults,
        saveTimeMode,
    };
}
