// Debug logging. On in dev builds; in production only when the user turns it on
// in the options page (setDebug is called with the stored setting at startup).

let enabled: boolean = import.meta.env.MODE !== 'production';

export function setDebug(on: boolean): void {
  enabled = on || import.meta.env.MODE !== 'production';
}

export function debug(...args: unknown[]): void {
  if (enabled) console.debug('[Real Deal]', ...args);
}
