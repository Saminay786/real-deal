// Phase 4 debug list of theme shifts. Phase 6 replaces this with the trends UI.
import type { ThemeAnalysis } from '../themes/analyze';
import type { Theme } from '../types';

export type ThemesState =
  | { kind: 'idle' }
  | { kind: 'running'; stage: string; done: number; total: number }
  | { kind: 'done'; analysis: ThemeAnalysis }
  | { kind: 'error'; message: string };

const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
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
          Star filters were used while collecting, so each theme is compared only within the same star level. A theme
          that rises only through more low-star reviews will not show as a change.
        </p>
      )}
      {a.dataSufficiency === 'insufficient' && <p class="small todo">Not enough data to test for changes.</p>}
      <ol class="shifts">
        {a.shifts.map((s) => (
          <li key={s.themeId}>
            <div>
              <ThemeName t={byId.get(s.themeId)} fallback={s.label} />{' '}
              {s.significant ? <span class="ok">· changed</span> : <span class="muted">· no clear change</span>}
            </div>
            <div class="small">
              {pct(s.before.share)} → {pct(s.after.share)} of reviews, from {month(s.changeAt)} · Δ {s.diff >= 0 ? '+' : ''}
              {pct(s.diff)} [{pct(s.diffCi[0])}, {pct(s.diffCi[1])}] · p = {s.pValue.toFixed(3)}, q = {s.qValue.toFixed(3)}
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
