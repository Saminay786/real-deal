// User settings, stored locally in chrome.storage.local (never synced or sent anywhere).

export interface Settings {
  /** Show the "likely 3.8–4.5" badge next to Amazon's star rating. */
  showBadge: boolean;
  /** Write debug logs to the browser console. */
  debug: boolean;
}

export const DEFAULT_SETTINGS: Settings = { showBadge: true, debug: false };

/** Fills in defaults for missing or malformed values. Pure, so it can be tested. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  return {
    showBadge: typeof r.showBadge === 'boolean' ? r.showBadge : DEFAULT_SETTINGS.showBadge,
    debug: typeof r.debug === 'boolean' ? r.debug : DEFAULT_SETTINGS.debug,
  };
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
