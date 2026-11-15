// Debug logging, off in production builds. (Phase 7 adds an options-page toggle.)

export const DEBUG: boolean = import.meta.env.MODE !== 'production';

export function debug(...args: unknown[]): void {
  if (DEBUG) console.debug('[Real Deal]', ...args);
}
