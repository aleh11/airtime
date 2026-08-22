import { useMemo, useState } from 'react';
import { CronJob } from '../types';

export type SortColumn = 'time' | 'freq' | 'service' | 'duration';
export type SortDirection = 'asc' | 'desc';

function valueFor(job: CronJob, column: SortColumn): string | number {
    switch (column) {
        case 'freq': return job.friendly_freq;
        case 'service': return job.radio_details.service;
        case 'duration': return parseInt(job.radio_details.duration);
        default: return job.friendly_time;
    }
}

export function useScheduleSorting(jobs: CronJob[]) {
    const [column, setColumn] = useState<SortColumn>('time');
    const [direction, setDirection] = useState<SortDirection>('asc');

    const sorted = useMemo(() => {
        return [...jobs].sort((a, b) => {
            const valueA = valueFor(a, column);
            const valueB = valueFor(b, column);
            if (valueA === valueB) return 0;
            return direction === 'asc' ? (valueA > valueB ? 1 : -1) : (valueA < valueB ? 1 : -1);
        });
    }, [jobs, column, direction]);

    const toggle = (next: SortColumn) => {
        if (column === next) {
            setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
            return;
        }
        setColumn(next);
        setDirection('asc');
    };

    return { sorted, column, direction, toggle };
}
