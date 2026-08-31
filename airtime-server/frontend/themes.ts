/**
 * Display names for the themes defined in themes.css. The daemon owns the list
 * of ids that are actually valid (internal/api/ui.go) and serves it as
 * `available_themes`; anything it offers that is missing here falls back to its
 * raw id rather than disappearing from the picker.
 */
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

/**
 * The appliance is the source of truth for the theme, but fetching it takes a
 * round trip and the page would paint the default first. Caching the last known
 * theme locally lets the first paint be right; the server value still wins as
 * soon as it lands.
 */
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
