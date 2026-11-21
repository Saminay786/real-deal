// Themes over time: one compact block per theme, one key per card (DECISIONS #41).
import type { ThemeAnalysis } from '../themes/analyze';
import type { ShiftResult, Theme } from '../types';
import { monthName, rangeWords, signed, ThemeChange, VERDICT_TEXT, verdictOf } from './ThemeChange';

export type ThemesState =
  | { kind: 'idle' }
  | { kind: 'running'; stage: string; done: number; total: number }
  | { kind: 'done'; analysis: ThemeAnalysis }
  | { kind: 'error'; message: string };

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

/** The single key for every graph in this card. */
function Key() {
  return (
    <div class="key small">
      <span>
        <i class="k-bar before" /> before
      </span>
      <span>
        <i class="k-bar after" /> after
      </span>
      <span>
        <i class="k-dot" /> change seen
      </span>
      <span>
        <i class="k-box" /> true change could be here
      </span>
      <span>
        <i class="k-zero" /> 0 = no change
      </span>
      <div class="muted">Box crosses the 0 line → could just be luck.</div>
    </div>
  );
}

function ThemeRow({ s, t }: { s: ShiftResult; t: Theme | undefined }) {
  const v = verdictOf(s);
  const before = Math.round(100 * s.before.share);
  const after = Math.round(100 * s.after.share);
  const d = Math.round(100 * s.diff);
  const lo = Math.round(100 * s.diffCi[0]);
  const hi = Math.round(100 * s.diffCi[1]);
  return (
    <li class="theme">
      <div class="theme-head">
        <strong>{t?.label ?? s.label}</strong>
        {t?.sentiment && <span class={`small senti ${t.sentiment}`}>{t.sentiment}</span>}
        <span class={`verdict ${v}`}>{VERDICT_TEXT[v]}</span>
      </div>
      <ThemeChange s={s} />
      <p class="small theme-line">
        {before}% → {after}% of reviews since {monthName(s.changeAt)} ({signed(d)} points).
      </p>
      <details class="small">
        <summary>Details</summary>
        <p>
          The true change could be anything {rangeWords(lo, hi)}.{' '}
          {v === 'real' && 'A jump this big is very unlikely to be luck.'}
          {v === 'luck' &&
            `With only ${s.before.n} reviews before and ${s.after.n} after, a gap this size often shows up even when nothing really changed.`}
          {v === 'not-proven' &&
            'We checked every month to find the biggest jump, and jumps this big still turn up by luck.'}
        </p>
        <p class="muted">
          Test: p = {s.pValue.toFixed(3)}, q = {s.qValue.toFixed(3)} (“Real change” needs q ≤ 0.10).
          {t?.labelSource === 'nano' && ` Keywords: ${t.topTerms.join(', ')}.`}
        </p>
        {(s.exemplars.before.length > 0 || s.exemplars.after.length > 0) && (
          <>
            <div class="muted">Examples before:</div>
            <ul>
              {s.exemplars.before.map((x, i) => (
                <li key={`b${i}`}>“{x}”</li>
              ))}
            </ul>
            <div class="muted">Examples after:</div>
            <ul>
              {s.exemplars.after.map((x, i) => (
                <li key={`a${i}`}>“{x}”</li>
              ))}
            </ul>
          </>
        )}
      </details>
    </li>
  );
}

function Results({ a, themes }: { a: ThemeAnalysis; themes: readonly Theme[] }) {
  const byId = new Map(themes.map((t) => [t.id, t]));
  return (
    <>
      <p class="small muted">
        {a.analysedReviews} reviews · {a.themes.length} themes
        {a.nonEnglishReviews > 0 && ` · ${a.nonEnglishReviews} Hindi/Hinglish reviews not analysed`}
      </p>
      {a.stratified && (
        <p class="small muted">
          Star filters were used and not every review is collected, so each theme is compared within the same star
          level. A theme that rises only through more low-star reviews won't show as a change.
        </p>
      )}
      {a.dataSufficiency === 'insufficient' && <p class="small todo">Not enough data to test for changes.</p>}
      {a.shifts.length > 0 && <Key />}
      <ol class="themes">
        {a.shifts.map((s) => (
          <ThemeRow key={s.themeId} s={s} t={byId.get(s.themeId)} />
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
