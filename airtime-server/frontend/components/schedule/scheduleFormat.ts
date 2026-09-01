import { CronJob, SystemStatus } from '../../types';

export const DURATION_OPTIONS = [
    { label: '10 min', value: 10 },
    { label: '20 min', value: 20 },
    { label: '30 min', value: 30 },
    { label: '1 hr', value: 60 },
    { label: '2 hr', value: 120 },
    { label: '4 hr', value: 240 },
    { label: '6 hr', value: 360 },
];

export function durationLabel(minutes: number): string {
    return DURATION_OPTIONS.find((option) => option.value === minutes)?.label ?? `${minutes}m`;
}

// Matches a schedule against the running broadcast's standard, duration and start.
export function isScheduleLive(job: CronJob, status: SystemStatus | null): boolean {
    if (!status?.services.txtempus_running) return false;
    if (status.services.txtempus_duration !== parseInt(job.radio_details.duration)) return false;
    if (status.services.txtempus_service && job.radio_details.service !== status.services.txtempus_service) return false;
    if (!status.services.txtempus_started_at) return false;

    try {
        const startedAt = new Date(status.services.txtempus_started_at);
        const startedMinutes = startedAt.getHours() * 60 + startedAt.getMinutes();
        const [hours, minutes] = job.friendly_time.split(':').map(Number);
        return Math.abs(startedMinutes - (hours * 60 + minutes)) <= 1;
    } catch {
        return false;
    }
}
