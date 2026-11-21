// User settings, stored locally in chrome.storage.local (never synced or sent anywhere).

export interface Settings {
  /** Show the "likely 3.8–4.5" badge next to Amazon's star rating. */
  showBadge: boolean;
  /** Show a Real Deal score on each search result card (separate from the rating badge, DECISIONS #52). */
  showSearchScores: boolean;
  /** Write debug logs to the browser console. */
  debug: boolean;
}

export const DEFAULT_SETTINGS: Settings = { showBadge: true, showSearchScores: true, debug: false };

/** Fills in defaults for missing or malformed values. Pure, so it can be tested. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const bool = (k: keyof Settings) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : DEFAULT_SETTINGS[k]);
  return { showBadge: bool('showBadge'), showSearchScores: bool('showSearchScores'), debug: bool('debug') };
}

export async function loadSettings(): Promise<Settings> {
  try {
    const stored = await chrome.storage.local.get('settings');
    return normalizeSettings(stored.settings);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ settings: s });
}
