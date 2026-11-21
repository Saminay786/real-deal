// Themes over time: one compact block per theme, one key per card (DECISIONS #41).
import type { ThemeAnalysis } from '../themes/analyze';
import type { ShiftResult, Theme, ThemeSeries } from '../types';
import { monthName, per100, rangeWords, signed, ThemeChange, VERDICT_TEXT, verdictOf } from './ThemeChange';

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
      <div>
        <strong>Top chart:</strong> % of reviews mentioning the theme, month by month
      </div>
      <span>
        <i class="k-line" /> monthly share (shaded: likely range)
      </span>
      <span>
        <i class="k-bar before" /> average before
      </span>
      <span>
        <i class="k-bar after" /> average after
      </span>
      <span>
        <i class="k-zero" /> split month
      </span>
      <div>
        <strong>Change:</strong> <i class="k-dot" /> change seen · <i class="k-box" /> true change could be here ·{' '}
        <i class="k-zero" /> 0 = no change
      </div>
      <div class="muted">Box crosses the 0 line → could just be luck.</div>
    </div>
  );
}

function Limitations() {
  return (
    <details class="small limits">
      <summary>Limitations</summary>
      <ul>
        <li>Only the reviews you viewed are analysed, and Amazon chooses which ones it shows.</li>
        <li>"Could just be luck" means not enough reviews to tell, not "nothing changed".</li>
        <li>
          Complaints about failures after months of use can rise as older units age, even if the product sold today is
          the same.
        </li>
        <li>A theme can mix related topics (e.g. packaging and clasp). Check its typical sentences.</li>
        <li>Hindi and Hinglish reviews are skipped (the language model is English-only).</li>
        <li>Reviews show what reviewers talk about, not what all buyers experience.</li>
      </ul>
    </details>
  );
}

function ThemeRow({ s, t, series }: { s: ShiftResult; t: Theme | undefined; series: ThemeSeries | undefined }) {
  const v = verdictOf(s);
  const before = Math.round(100 * s.before.share);
  const after = Math.round(100 * s.after.share);
  const d = Math.round(100 * s.diff);
  const lo = Math.round(100 * s.diffCi[0]);
  const hi = Math.round(100 * s.diffCi[1]);
  return (
    <li class={`theme ${v === 'real' ? 'is-real' : ''}`}>
      <div class="theme-head">
        <strong>{t?.label ?? s.label}</strong>
        {t?.sentiment && <span class={`small senti ${t.sentiment}`}>{t.sentiment}</span>}
        <span class={`verdict ${v}`}>{VERDICT_TEXT[v]}</span>
      </div>
      <ThemeChange s={s} series={series} />
      <p class="small theme-line">
        {before}% ({s.before.k} of {s.before.n} reviews) → {after}% ({s.after.k} of {s.after.n}) since{' '}
        {monthName(s.changeAt)}, {signed(d)} points.
      </p>
      <details class="small">
        <summary>Details</summary>
        <p>
          The true change could be anything {rangeWords(lo, hi)}: {per100(s.before.share, lo, hi)}.{' '}
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
            <div class="muted">Most typical sentences before:</div>
            <ul>
              {s.exemplars.before.map((x, i) => (
                <li key={`b${i}`}>“{x}”</li>
              ))}
            </ul>
            <div class="muted">Most typical sentences after:</div>
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
  const seriesById = new Map(a.series.map((x) => [x.themeId, x]));
  const real = a.shifts.filter((s) => s.significant).length;
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
      {a.shifts.length > 0 && (
        <p class={real > 0 ? 'headline real' : 'headline'}>
          {real > 0
            ? `${real} theme${real === 1 ? '' : 's'} changed clearly. Shown first.`
            : 'No theme changed clearly over this period.'}
        </p>
      )}
      {a.shifts.length > 0 && <Key />}
      <ol class="themes">
        {a.shifts.map((s) => (
          <ThemeRow key={s.themeId} s={s} t={byId.get(s.themeId)} series={seriesById.get(s.themeId)} />
        ))}
      </ol>
      <Limitations />
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
