import {
    SystemStatus,
    SystemMetrics,
    CronJob,
    CronJobInput,
    RadioConfig,
    RadioConfigInput,
    UiConfig,
    UiConfigInput,
    TransmitRequest,
    UpdateInfo, ReleaseChannel } from '../types';

const API_BASE = '';

const handleResponse = async <T,>(response: Response): Promise<T> => {
    if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    return response.json();
};

const headers = {
    'Content-Type': 'application/json'
};

export const api = {
    getStatus: async (): Promise<SystemStatus> => {
        const res = await fetch(`${API_BASE}/api/status`);
        return handleResponse<SystemStatus>(res);
    },

    getCrons: async (): Promise<CronJob[]> => {
        const res = await fetch(`${API_BASE}/api/crons`);
        return handleResponse<CronJob[]>(res);
    },

    addOrUpdateCron: async (job: CronJobInput): Promise<{ status: string }> => {
        const res = await fetch(`${API_BASE}/api/crons`, {
            method: 'POST',
            headers,
            body: JSON.stringify(job),
        });
        return handleResponse<{ status: string }>(res);
    },

    deleteCron: async (jobId: string): Promise<{ status: string }> => {
        const res = await fetch(`${API_BASE}/api/crons/${jobId}`, {
            method: 'DELETE',
        });
        return handleResponse<{ status: string }>(res);
    },

    getRadioConfig: async (): Promise<RadioConfig> => {
        const res = await fetch(`${API_BASE}/api/settings/radio`);
        return handleResponse<RadioConfig>(res);
    },

    updateRadioConfig: async (config: RadioConfigInput): Promise<{ status: string }> => {
        const res = await fetch(`${API_BASE}/api/settings/radio`, {
            method: 'POST',
            headers,
            body: JSON.stringify(config),
        });
        return handleResponse<{ status: string }>(res);
    },

    toggleStealth: async (): Promise<{ stealth_mode: boolean }> => {
        const res = await fetch(`${API_BASE}/api/control/stealth`, {
            method: 'POST',
        });
        return handleResponse<{ stealth_mode: boolean }>(res);
    },

    transmit: async (req: TransmitRequest): Promise<{ status: string; command: string }> => {
        const res = await fetch(`${API_BASE}/api/control/transmit`, {
            method: 'POST',
            headers,
            body: JSON.stringify(req),
        });
        return handleResponse<{ status: string; command: string }>(res);
    },

    stopTransmit: async (): Promise<{ status: string }> => {
        const res = await fetch(`${API_BASE}/api/control/stop`, {
            method: 'POST',
        });
        return handleResponse<{ status: string }>(res);
    },

    restartServer: async (): Promise<{ status: string }> => {
        const res = await fetch(`${API_BASE}/api/control/restart`, {
            method: 'POST',
        });
        return handleResponse<{ status: string }>(res);
    },

    restartPi: async (): Promise<{ status: string }> => {
        const res = await fetch(`${API_BASE}/api/control/restart-pi`, {
            method: 'POST',
        });
        return handleResponse<{ status: string }>(res);
    },

    getSystemMetrics: async (): Promise<SystemMetrics> => {
        const res = await fetch(`${API_BASE}/api/system/metrics`);
        return handleResponse<SystemMetrics>(res);
    },

    checkUpdates: async (): Promise<UpdateInfo> => {
        const res = await fetch(`${API_BASE}/api/system/check-updates`);
        return handleResponse<UpdateInfo>(res);
    },

    getReleaseChannel: async (): Promise<{ channel: ReleaseChannel }> => {
        const res = await fetch(`${API_BASE}/api/system/release-channel`);
        return handleResponse<{ channel: ReleaseChannel }>(res);
    },

    setReleaseChannel: async (channel: ReleaseChannel): Promise<{ channel: ReleaseChannel }> => {
        const res = await fetch(`${API_BASE}/api/system/release-channel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel }),
        });
        return handleResponse<{ channel: ReleaseChannel }>(res);
    },

    applyUpdate: async (): Promise<{ status: string; message: string }> => {
        const res = await fetch(`${API_BASE}/api/system/apply-update`, {
            method: 'POST',
        });
        return handleResponse<{ status: string; message: string }>(res);
    },

    getUiConfig: async (): Promise<UiConfig> => {
        const res = await fetch(`${API_BASE}/api/settings/ui`);
        return handleResponse<UiConfig>(res);
    },

    updateUiConfig: async (config: UiConfigInput): Promise<{ status: string }> => {
        const res = await fetch(`${API_BASE}/api/settings/ui`, {
            method: 'POST',
            headers,
            body: JSON.stringify(config),
        });
        return handleResponse<{ status: string }>(res);
    },

    getTimeTester: async (): Promise<{ enabled: boolean; service: string }> => {
        const res = await fetch(`${API_BASE}/api/control/time-tester`);
        return handleResponse<{ enabled: boolean; service: string }>(res);
    },

    setTimeTester: async (enabled: boolean, service: string, duration_hours: number = 12): Promise<{ enabled: boolean; affected_jobs: number }> => {
        const res = await fetch(`${API_BASE}/api/control/time-tester`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ enabled, service, duration_hours }),
        });
        return handleResponse<{ enabled: boolean; affected_jobs: number }>(res);
    },
};
