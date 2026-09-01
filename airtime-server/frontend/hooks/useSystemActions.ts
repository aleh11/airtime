import { useState } from 'react';
import { api } from '../services/api';

const RECONNECT_ATTEMPTS = 60;
const RECONNECT_DELAY_MS = 1000;

async function waitForDaemon(): Promise<boolean> {
    for (let attempt = 0; attempt < RECONNECT_ATTEMPTS; attempt++) {
        try {
            await api.getStatus();
            return true;
        } catch {
            await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
        }
    }
    return false;
}

export type RestartTarget = 'service' | 'pi';

export function useSystemActions() {
    const [restarting, setRestarting] = useState<RestartTarget | null>(null);

    const restart = async (target: RestartTarget): Promise<boolean> => {
        setRestarting(target);
        try {
            if (target === 'pi') {
                await api.restartPi();
                await new Promise((resolve) => setTimeout(resolve, 10000));
            } else {
                await api.restartServer();
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }

            const online = await waitForDaemon();
            if (online && target === 'service') {
                window.location.reload();
            }
            return online;
        } catch (e) {
            console.error(`Failed to restart ${target}`, e);
            return false;
        } finally {
            setRestarting(null);
        }
    };

    return { restarting, restart };
}
