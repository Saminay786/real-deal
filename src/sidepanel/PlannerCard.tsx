import { PLAN, viewKey, viewLabel, viewStatus, type ReviewView, type ViewProgress, type ViewStatus } from '../collect/views';
import type { LoadEnd } from '../content/amazon/loader';

const ICON: Record<ViewStatus, string> = { todo: '○', partial: '◐', capped: '✓', complete: '✓' };
const NOTE: Record<ViewStatus, string> = { todo: '', partial: 'in progress', capped: 'Amazon limit', complete: 'all loaded' };

const END_TEXT: Record<LoadEnd, string> = {
  cap: 'Last load finished: Amazon shows 100 reviews per view.',
  end: 'Last load finished: every review in this view is loaded.',
  stopped: 'Last load was stopped.',
  captcha: 'Amazon showed a robot check. Solve it, wait a few minutes, then continue.',
  stuck: 'Amazon stopped adding reviews. Try again in a moment.',
};

export interface LoadState {
  running: boolean;
  loaded: number;
  end: LoadEnd | null;
  error: string | null;
}

interface Props {
  current: ReviewView | null;
  progress: ReadonlyMap<string, ViewProgress>;
  load: LoadState;
  onOpen: (v: ReviewView) => void;
  /** Every written review on Amazon has been collected. */
  allCollected?: boolean;
}

/** All sort/filter views, folded away: the next-step bar at the top drives collection. */
export function PlannerCard({ current, progress, load, onOpen, allCollected = false }: Props) {
  const currentKey = current ? viewKey(current) : null;
  const done = PLAN.filter((v) => {
    const s = viewStatus(progress.get(viewKey(v)));
    return s === 'capped' || s === 'complete';
  }).length;

  return (
    <section class="card">
      {!load.running && load.end && <p class={`small ${load.end === 'captcha' ? 'warn' : 'muted'}`}>{END_TEXT[load.end]}</p>}
      {allCollected && (
        <p class="small ok">✓ Every written review is collected. The remaining filters would add nothing.</p>
      )}
      <details>
        <summary>
          All review filters ({done} of {PLAN.length} done)
        </summary>
        <p class="small muted">
          Amazon shows at most 100 reviews per filter, so each one adds a different slice of history. Click a name to
          open it.
        </p>
        <ul class="plan">
          {PLAN.map((v) => {
            const key = viewKey(v);
            const p = progress.get(key);
            const st = viewStatus(p);
            return (
              <li key={key} class={key === currentKey ? 'current' : ''}>
                <span class={`ico ${st}`}>{ICON[st]}</span>
                <button type="button" class="link" onClick={() => onOpen(v)} title="Open this filter">
                  {viewLabel(v)}
                </button>
                <span class="small muted">
                  {p && p.seen > 0 ? `${p.seen}` : ''} {NOTE[st]}
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}
