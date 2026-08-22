import { useState } from 'react';
import { api } from '../services/api';
import { UpdateInfo } from '../types';

const UP_TO_DATE_BANNER_MS = 5000;
const RECONNECT_ATTEMPTS = 90;
const RECONNECT_DELAY_MS = 1000;

type BannerType = 'available' | 'up-to-date' | null;

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

/**
 * Owns the update lifecycle: asking GitHub what the latest release is, showing
 * the outcome, and waiting for the daemon to come back after it installs one.
 */
export function useSystemUpdate() {
    const [info, setInfo] = useState<UpdateInfo | null>(null);
    const [banner, setBanner] = useState<BannerType>(null);
    const [confirming, setConfirming] = useState(false);
    const [installing, setInstalling] = useState(false);

    const check = async (manual = false) => {
        try {
            const result = await api.checkUpdates();
            setInfo(result);

            if (result.updates_available) {
                setBanner('available');
                return;
            }
            if (manual) {
                setBanner('up-to-date');
                setTimeout(() => setBanner((current) => (current === 'up-to-date' ? null : current)), UP_TO_DATE_BANNER_MS);
                return;
            }
            setBanner(null);
        } catch (e) {
            console.error('Update check failed', e);
        }
    };

    const install = async () => {
        setConfirming(false);
        setInstalling(true);

        try {
            await api.applyUpdate();
            // The helper swaps the binary and restarts the service, so the daemon
            // disappears for a few seconds before answering again.
            await new Promise((resolve) => setTimeout(resolve, 3000));
            await waitForDaemon();
            window.location.reload();
        } catch (e) {
            console.error('Update failed', e);
            setInstalling(false);
            alert('Update failed. Check the logs with: journalctl -u airtime-update');
        }
    };

    return {
        info,
        banner,
        confirming,
        installing,
        check,
        install,
        requestConfirmation: () => setConfirming(true),
        cancelConfirmation: () => setConfirming(false),
        dismissBanner: () => setBanner(null),
    };
}
