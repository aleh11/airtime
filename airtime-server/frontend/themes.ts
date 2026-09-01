// Display names only; the daemon owns which ids are valid. Unknown ids fall back to the id.
export const THEME_LABELS: Record<string, string> = {
    'airtime-dark': 'AirTime Dark',
    'airtime-light': 'AirTime Light',
    'tokyo-night': 'Tokyo Night',
    dracula: 'Dracula',
    nord: 'Nord',
    'gruvbox-dark': 'Gruvbox Dark',
    'one-dark': 'One Dark',
    'catppuccin-mocha': 'Catppuccin Mocha',
    'solarized-light': 'Solarized Light',
};

export const DEFAULT_THEME = 'airtime-dark';

const CACHE_KEY = 'airtime.theme';

export function themeLabel(id: string): string {
    return THEME_LABELS[id] ?? id;
}

export function applyTheme(id: string): void {
    document.documentElement.dataset.theme = id;
}

// Cached only so the first paint is right; the server value wins once it lands.
export function cacheTheme(id: string): void {
    try {
        localStorage.setItem(CACHE_KEY, id);
    } catch {
        // A browser with site data blocked just pays the one-frame flash.
    }
}

export function applyCachedTheme(): void {
    try {
        applyTheme(localStorage.getItem(CACHE_KEY) ?? DEFAULT_THEME);
    } catch {
        applyTheme(DEFAULT_THEME);
    }
}
