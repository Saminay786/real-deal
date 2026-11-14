// Dev-only card (build with `npm run build:fixtures`): saves the current tab as a test fixture.
import { useState } from 'preact/hooks';
import { PERSONAL_INFO_SELECTORS } from '../content/amazon/selectors';
import { snapshotInPage } from '../content/amazon/snapshot';

const NAMES = [
  'product-many',
  'product-few',
  'product-none',
  'reviews-a-p1',
  'reviews-a-p2',
  'reviews-b-p1',
] as const;

async function savePage(name: string): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error('No active tab.');
  if (!tab.url?.startsWith('https://www.amazon.in/')) throw new Error('Switch to an amazon.in tab first.');
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: snapshotInPage,
    args: [[...PERSONAL_INFO_SELECTORS]],
  });
  const html: unknown = result?.result;
  if (typeof html !== 'string') throw new Error('Could not read the page. Try again.');
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function FixtureSaver() {
  const [saved, setSaved] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const onClick = (name: string) => {
    setError(null);
    savePage(name).then(
      () => setSaved((s) => (s.includes(name) ? s : [...s, name])),
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  };

  return (
    <section style={{ border: '1px dashed #999', borderRadius: '8px', padding: '10px', marginTop: '12px' }}>
      <h2 style={{ fontSize: '14px', margin: '0 0 6px' }}>Save page for tests (dev)</h2>
      <p style={{ fontSize: '12px', margin: '0 0 8px' }}>
        Open the page, scroll through it, then click its name. Files go to your Downloads folder.
      </p>
      <div style={{ display: 'grid', gap: '6px' }}>
        {NAMES.map((n) => (
          <button key={n} type="button" onClick={() => onClick(n)} style={{ padding: '6px', textAlign: 'left' }}>
            {saved.includes(n) ? '✓ ' : ''}
            {n}
          </button>
        ))}
      </div>
      {error && <p style={{ color: '#b00020', fontSize: '12px' }}>{error}</p>}
    </section>
  );
}
