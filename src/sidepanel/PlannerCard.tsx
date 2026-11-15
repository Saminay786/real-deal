import {
  PLAN,
  nextView,
  viewKey,
  viewLabel,
  viewStatus,
  type ReviewView,
  type ViewProgress,
  type ViewStatus,
} from '../collect/views';
import type { LoadEnd } from '../content/amazon/loader';

const ICON: Record<ViewStatus, string> = { todo: '○', partial: '◐', capped: '✓', complete: '✓' };
const NOTE: Record<ViewStatus, string> = { todo: '', partial: 'in progress', capped: 'Amazon limit', complete: 'all loaded' };

const END_TEXT: Record<LoadEnd, string> = {
  cap: 'Done: Amazon shows 100 per view. Open the next one.',
  end: 'Done: every review in this view is loaded.',
  stopped: 'Stopped.',
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
  current: ReviewView | null; // null when not on a review page
  progress: ReadonlyMap<string, ViewProgress>;
  load: LoadState;
  onLoad: () => void;
  onStop: () => void;
  onOpen: (v: ReviewView) => void;
}

export function PlannerCard({ current, progress, load, onLoad, onStop, onOpen }: Props) {
  const next = nextView(progress);
  const currentKey = current ? viewKey(current) : null;
  const currentStatus = current ? viewStatus(progress.get(viewKey(current))) : null;
  const canLoad = current !== null && currentStatus !== 'capped' && currentStatus !== 'complete';

  return (
    <section class="card">
      <h2>Collect more history</h2>
      {current ? (
        <div class="loadrow">
          <div>
            <div class="small muted">This view</div>
            <strong>{viewLabel(current)}</strong>
          </div>
          {load.running ? (
            <button type="button" onClick={onStop}>
              Stop · {load.loaded}/100
            </button>
          ) : (
            <button type="button" class="primary" onClick={onLoad} disabled={!canLoad}>
              Load this view
            </button>
          )}
        </div>
      ) : (
        <p class="small muted">Open the product's reviews to start.</p>
      )}
      {load.error && <p class="small warn">{load.error}</p>}
      {!load.running && load.end && <p class={`small ${load.end === 'captcha' ? 'warn' : 'muted'}`}>{END_TEXT[load.end]}</p>}

      {next && (!current || viewKey(next) !== currentKey || !canLoad) && (
        <p class="next">
          Next: <strong>{viewLabel(next)}</strong>{' '}
          <button type="button" onClick={() => onOpen(next)}>
            Open
          </button>
        </p>
      )}
      {!next && <p class="ok small">All planned views done.</p>}

      <ul class="plan">
        {PLAN.map((v) => {
          const key = viewKey(v);
          const p = progress.get(key);
          const st = viewStatus(p);
          return (
            <li key={key} class={key === currentKey ? 'current' : ''}>
              <span class={`ico ${st}`}>{ICON[st]}</span>
              <button type="button" class="link" onClick={() => onOpen(v)} title="Open this view">
                {viewLabel(v)}
              </button>
              <span class="small muted">
                {p && p.seen > 0 ? `${p.seen}` : ''} {NOTE[st]}
              </span>
            </li>
          );
        })}
      </ul>
      <p class="small muted">
        "Load this view" clicks Amazon's "Show 10 more" for you every 2–4 seconds, up to Amazon's 100 per view. Keep
        this tab in front; switching away stops it.
      </p>
    </section>
  );
}
