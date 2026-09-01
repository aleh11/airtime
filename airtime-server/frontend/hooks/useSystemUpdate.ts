import { useState } from 'react';
import { api } from '../services/api';
import { UpdateInfo } from '../types';

const UP_TO_DATE_BANNER_MS = 5000;
const RECONNECT_ATTEMPTS = 240;
const RECONNECT_DELAY_MS = 1000;

type BannerType = 'available' | 'up-to-date' | null;

// The old daemon still answers while the helper downloads, so wait for the version to change.
async function waitForNewVersion(before: string | undefined): Promise<boolean> {
    for (let attempt = 0; attempt < RECONNECT_ATTEMPTS; attempt++) {
        try {
            const status = await api.getStatus();
            if (!before || (status.version && status.version !== before)) {
                return true;
            }
        } catch {
            // The daemon is mid-restart; that is the expected path, not an error.
        }
        await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
    }
    return false;
}

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
            const before = info?.current_version ?? (await api.getStatus().catch(() => null))?.version;
            await api.applyUpdate();
            await waitForNewVersion(before);
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
