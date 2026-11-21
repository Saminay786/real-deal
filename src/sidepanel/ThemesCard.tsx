// Phase 4 debug list of theme shifts. Phase 6 replaces this with the trends UI.
import type { ThemeAnalysis } from '../themes/analyze';
import type { Theme } from '../types';
import { ThemeChange } from './ThemeChange';

export type ThemesState =
  | { kind: 'idle' }
  | { kind: 'running'; stage: string; done: number; total: number }
  | { kind: 'done'; analysis: ThemeAnalysis }
  | { kind: 'error'; message: string };

const month = (iso: string) => {
  const [y, m] = iso.split('-');
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1] ?? '?'} ${y}`;
};

const STAGE: Record<string, string> = {
  'loading-model': 'Loading the language model…',
  embedding: 'Reading sentences',
  clustering: 'Finding themes and testing for changes…',
};

interface Props {
  state: ThemesState;
  /** Themes with on-device AI labels, if available. */
  aiThemes: readonly Theme[] | null;
  canRun: boolean;
  onRun: () => void;
}

export function ThemesCard({ state, aiThemes, canRun, onRun }: Props) {
  return (
    <section class="card">
      <h2>Themes over time</h2>
      {canRun && state.kind !== 'running' && (
        <p>
          <button type="button" class="primary" onClick={onRun}>
            {state.kind === 'done' ? 'Re-run analysis' : 'Find themes'}
          </button>
        </p>
      )}
      {state.kind === 'running' && (
        <p class="small">
          {STAGE[state.stage] ?? state.stage}
          {state.stage === 'embedding' && ` ${state.done}/${state.total}`}
        </p>
      )}
      {state.kind === 'error' && <p class="small warn">Analysis failed: {state.message}</p>}
      {state.kind === 'done' && <Results a={state.analysis} themes={aiThemes ?? state.analysis.themes} />}
    </section>
  );
}

function ThemeName({ t, fallback }: { t: Theme | undefined; fallback: string }) {
  if (!t) return <strong>{fallback}</strong>;
  return (
    <>
      <strong>{t.label}</strong>
      {t.sentiment && <span class={`small senti ${t.sentiment}`}> {t.sentiment}</span>}
      {t.labelSource === 'nano' && <span class="small muted"> ({t.topTerms.join(', ')})</span>}
    </>
  );
}

function Results({ a, themes }: { a: ThemeAnalysis; themes: readonly Theme[] }) {
  const byId = new Map(themes.map((t) => [t.id, t]));
  return (
    <>
      <p class="small muted">
        {a.analysedReviews} reviews · {a.sentences} sentences · {a.themes.length} themes. {a.explanation}
        {a.nonEnglishReviews > 0 && ` ${a.nonEnglishReviews} Hindi/Hinglish reviews not analysed (English model).`}
      </p>
      {a.stratified && (
        <p class="small muted">
          Star filters were used and not every review is collected, so each theme is compared only within the same
          star level. A theme that rises only through more low-star reviews will not show as a change.
        </p>
      )}
      <details class="small legend">
        <summary>How to read this</summary>
        <ul>
          <li>
            <strong>Theme</strong>: a topic that reviews keep mentioning, found by grouping sentences with similar meaning.
          </li>
          <li>
            <strong>Grey and blue bars</strong>: the share of reviews mentioning the theme <em>before</em> and{' '}
            <em>after</em> one split month (all reviews on each side pooled, not month by month).
          </li>
          <li>
            <strong>Change line</strong>: the <strong>dot</strong> is the change in points (after − before). The shaded{' '}
            <strong>band</strong> is the likely range of the real change (95% confidence interval). The dashed line is{' '}
            <strong>0 = no change</strong>. If the band covers 0, the change could be chance.
          </li>
          <li>
            <strong>p</strong>: how often a change at least this big appears by pure chance, if nothing really changed
            (from shuffling the review dates 999 times). Small p means unlikely to be chance.
          </li>
          <li>
            <strong>q</strong>: p corrected for testing several themes at once. <strong>“changed”</strong> is shown only
            when q ≤ 0.10. Otherwise it says “no clear change”, which means <em>not enough evidence</em>, not “proven
            stable”.
          </li>
          <li>
            <strong>positive / negative / mixed</strong>: the overall tone of the theme's sentences (on-device AI).
          </li>
        </ul>
      </details>
      {a.dataSufficiency === 'insufficient' && <p class="small todo">Not enough data to test for changes.</p>}
      <ol class="shifts">
        {a.shifts.map((s) => (
          <li key={s.themeId}>
            <div>
              <ThemeName t={byId.get(s.themeId)} fallback={s.label} />{' '}
              {s.significant ? <span class="ok">· changed</span> : <span class="muted">· no clear change</span>}
            </div>
            <ThemeChange s={s} />
            <div class="small muted">
              Test: p = {s.pValue.toFixed(3)}, q = {s.qValue.toFixed(3)} (“changed” needs q ≤ 0.10; split at{' '}
              {month(s.changeAt)})
            </div>
            <details class="small">
              <summary>Examples</summary>
              <div class="muted">Before:</div>
              <ul>
                {s.exemplars.before.map((t, i) => (
                  <li key={`b${i}`}>“{t}”</li>
                ))}
              </ul>
              <div class="muted">After:</div>
              <ul>
                {s.exemplars.after.map((t, i) => (
                  <li key={`a${i}`}>“{t}”</li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ol>
      {themes
        .filter((t) => !a.shifts.some((s) => s.themeId === t.id))
        .map((t) => (
          <p key={t.id} class="small muted">
            {t.label} ({t.size} sentences): not testable
          </p>
        ))}
    </>
  );
}
