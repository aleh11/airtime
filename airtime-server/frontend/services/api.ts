import {
    SystemStatus,
    SystemMetrics,
    CronJob,
    CronJobInput,
    RadioConfig,
    RadioConfigInput,
    TransmitRequest
} from '../types';

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

    checkUpdates: async (): Promise<{ updates_available: boolean; local_commit: string; remote_commit: string }> => {
        const res = await fetch(`${API_BASE}/api/system/check-updates`);
        return handleResponse<{ updates_available: boolean; local_commit: string; remote_commit: string }>(res);
    },

    applyUpdate: async (): Promise<{ status: string; message: string }> => {
        const res = await fetch(`${API_BASE}/api/system/apply-update`, {
            method: 'POST',
        });
        return handleResponse<{ status: string; message: string }>(res);
    },
};
