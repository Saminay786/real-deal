// Dev-only: serialise the live page (after AJAX updates) as a test fixture.
// Injected with chrome.scripting.executeScript, so it must be self-contained:
// no imports or outer variables inside the function body.
// Scripts are dropped and personal details (name, delivery location) are blanked.

export function snapshotInPage(personalInfoSelectors: string[]): string {
  const root = document.documentElement.cloneNode(true) as HTMLElement;
  for (const el of root.querySelectorAll('script, noscript, iframe')) el.remove();
  for (const sel of personalInfoSelectors) {
    for (const el of root.querySelectorAll(sel)) {
      el.textContent = '[redacted]';
      // Names/addresses also hide in accessibility attributes, e.g. aria-label="Deliver to <name> - <city> <pincode>".
      for (const attr of ['aria-label', 'title', 'alt', 'data-value']) {
        if (el.hasAttribute(attr)) el.setAttribute(attr, '[redacted]');
      }
    }
  }
  return `<!doctype html>\n<!-- saved from ${location.href} at ${new Date().toISOString()} -->\n${root.outerHTML}`;
}
