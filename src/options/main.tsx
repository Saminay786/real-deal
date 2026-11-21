import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../settings';
import '../sidepanel/style.css';

function Options() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadSettings().then(setS);
  }, []);

  const update = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    void saveSettings(next).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  return (
    <main style={{ maxWidth: '560px' }}>
      <h1>Real Deal options</h1>
      <section class="card">
        <label class="opt">
          <input type="checkbox" checked={s.showBadge} onChange={(e) => update({ showBadge: e.currentTarget.checked })} />
          <span>
            <strong>Show the rating range badge</strong>
            <br />
            <span class="small muted">"likely 3.8–4.5" next to Amazon's star rating on product pages.</span>
          </span>
        </label>
        <label class="opt">
          <input
            type="checkbox"
            checked={s.showSearchScores}
            onChange={(e) => update({ showSearchScores: e.currentTarget.checked })}
          />
          <span>
            <strong>Show scores on search results</strong>
            <br />
            <span class="small muted">"Real Deal score 4.25" under each product on amazon.in search pages.</span>
          </span>
        </label>
        <label class="opt">
          <input type="checkbox" checked={s.debug} onChange={(e) => update({ debug: e.currentTarget.checked })} />
          <span>
            <strong>Debug logging</strong>
            <br />
            <span class="small muted">Writes details to the browser console (for troubleshooting).</span>
          </span>
        </label>
        <p class="small ok" style={{ visibility: saved ? 'visible' : 'hidden' }}>
          ✓ Saved
        </p>
      </section>
      <section class="card">
        <h2>Privacy</h2>
        <p class="small">
          Everything runs on this computer. Reviews and settings are stored only in this browser. The language model is
          bundled with the extension, and Gemini Nano runs inside Chrome. Real Deal makes no network requests of its own,
          and Chrome enforces that.
        </p>
      </section>
    </main>
  );
}

const root = document.getElementById('app');
if (root) render(<Options />, root);
