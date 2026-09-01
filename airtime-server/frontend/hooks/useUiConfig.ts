import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { applyTheme, cacheTheme, DEFAULT_THEME } from '../themes';

// Stored on the appliance so appearance follows the hardware, not the browser.
export function useUiConfig() {
    const [theme, setThemeState] = useState(DEFAULT_THEME);
    const [availableThemes, setAvailableThemes] = useState<string[]>([]);

    useEffect(() => {
        let cancelled = false;

        api.getUiConfig()
            .then((config) => {
                if (cancelled) return;
                setThemeState(config.theme);
                setAvailableThemes(config.available_themes);
                applyTheme(config.theme);
                cacheTheme(config.theme);
            })
            .catch((e) => console.error('Failed to load the UI config', e));

        return () => { cancelled = true; };
    }, []);

    const setTheme = useCallback(async (next: string) => {
        const previous = theme;

        // Paint first, persist second: the picker should feel instant, and a
        // failed write is recoverable by putting the old theme back.
        setThemeState(next);
        applyTheme(next);
        cacheTheme(next);

        try {
            await api.updateUiConfig({ theme: next });
        } catch (e) {
            console.error('Failed to save the theme', e);
            setThemeState(previous);
            applyTheme(previous);
            cacheTheme(previous);
        }
    }, [theme]);

    return { theme, availableThemes, setTheme };
}
