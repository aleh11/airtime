import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { CronJob } from '../types';

export interface ScheduleDraft {
    time: string;
    frequency: string;
    standard: string;
    duration: number;
}

const EMPTY_DRAFT: ScheduleDraft = { time: '12:00', frequency: 'daily', standard: 'DCF77', duration: 10 };

/**
 * Owns the add/edit form for schedules, including dismissing it on Escape or a
 * click outside the row being edited. The daemon builds the txtempus command
 * from the stored settings, so the form only sends what the user chose.
 */
export function useScheduleEditor(onSaved: () => void, onError: (message: string) => void) {
    const [draft, setDraft] = useState<ScheduleDraft>(EMPTY_DRAFT);
    const [adding, setAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const rowRef = useRef<HTMLTableRowElement | null>(null);
    const cardRef = useRef<HTMLDivElement | null>(null);

    const cancel = useCallback(() => setEditingId(null), []);

    useEffect(() => {
        if (!editingId) return;

        const onClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            const inside = rowRef.current?.contains(target) || cardRef.current?.contains(target);
            if (!inside) cancel();
        };
        const onEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') cancel();
        };

        document.addEventListener('mousedown', onClickOutside);
        document.addEventListener('keydown', onEscape);
        return () => {
            document.removeEventListener('mousedown', onClickOutside);
            document.removeEventListener('keydown', onEscape);
        };
    }, [editingId, cancel]);

    const startAdding = () => {
        setDraft(EMPTY_DRAFT);
        setEditingId(null);
        setAdding(true);
    };

    const startEditing = (job: CronJob) => {
        setDraft({
            time: job.friendly_time,
            frequency: job.friendly_freq,
            standard: job.radio_details.service,
            duration: parseInt(job.radio_details.duration),
        });
        setAdding(false);
        setEditingId(job.id);
    };

    const save = async (id?: string) => {
        try {
            await api.addOrUpdateCron({
                id: id || `job-${Date.now()}`,
                time: draft.time,
                frequency: draft.frequency,
                service: draft.standard,
                duration: draft.duration,
                enabled: true,
            });
            setAdding(false);
            setEditingId(null);
            if (!id) setDraft(EMPTY_DRAFT);
            onSaved();
        } catch (e) {
            console.error('Failed to save the schedule', e);
            onError('Failed to save the schedule. Check the logs with: journalctl -u airtime');
        }
    };

    const setEnabled = async (job: CronJob, enabled: boolean) => {
        try {
            await api.addOrUpdateCron({
                id: job.id,
                time: job.friendly_time,
                frequency: job.friendly_freq,
                service: job.radio_details.service,
                duration: parseInt(job.radio_details.duration),
                enabled,
            });
            onSaved();
        } catch (e) {
            console.error('Failed to toggle the schedule', e);
        }
    };

    return {
        draft,
        setDraft,
        adding,
        editingId,
        rowRef,
        cardRef,
        startAdding,
        stopAdding: () => setAdding(false),
        startEditing,
        cancel,
        save,
        setEnabled,
    };
}
