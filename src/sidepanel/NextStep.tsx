// One clear "what to do now" bar, pinned to the top of the side panel.
// The user found the right button hard to find among the cards (DECISIONS #33).

export type Step =
  | { kind: 'no-product' }
  | { kind: 'open-reviews'; reviewsNeeded: number; onOpen: () => void }
  | { kind: 'load-view'; viewLabel: string; onLoad: () => void; onAnalyse: (() => void) | null }
  | { kind: 'rerun'; newReviews: number; onRerun: () => void }
  | { kind: 'loading'; loaded: number; onStop: () => void }
  | { kind: 'open-next'; nextLabel: string; reviewsNeeded: number; monthsNeeded: number; onOpen: () => void }
  | { kind: 'find-themes'; reviews: number; onRun: () => void; onMore: (() => void) | null; moreLabel: string | null }
  | { kind: 'analysing'; stage: string }
  | { kind: 'done'; onRerun: () => void };

const STEP_NO: Record<Step['kind'], number> = {
  'no-product': 0,
  'open-reviews': 1,
  'load-view': 1,
  loading: 1,
  'open-next': 1,
  'find-themes': 2,
  analysing: 2,
  rerun: 2,
  done: 3,
};

function Progress({ n }: { n: number }) {
  return (
    <div class="steps" aria-label={`Step ${n} of 3`}>
      {['Collect reviews', 'Find themes', 'Read results'].map((name, i) => (
        <span key={name} class={i + 1 < n ? 'step done' : i + 1 === n ? 'step now' : 'step'}>
          {i + 1 < n ? '✓' : i + 1} {name}
        </span>
      ))}
    </div>
  );
}

const need = (reviews: number, months: number) =>
  [reviews > 0 ? `${reviews} more reviews` : null, months > 0 ? `${months} more months` : null].filter(Boolean).join(' and ');

export function NextStep({ step, error }: { step: Step; error: string | null }) {
  const n = STEP_NO[step.kind];
  return (
    <section class="nextstep">
      {n > 0 && <Progress n={n} />}
      {step.kind === 'no-product' && <p class="hint">Open a product on amazon.in to start.</p>}

      {step.kind === 'open-reviews' && (
        <>
          <p class="hint">Collect this product's reviews ({step.reviewsNeeded} needed to analyse).</p>
          <button type="button" class="primary big" onClick={step.onOpen}>
            Open the reviews
          </button>
        </>
      )}

      {step.kind === 'load-view' && (
        <>
          <p class="hint">
            Load the reviews on this page (<strong>{step.viewLabel}</strong>). Keep this tab in front while it runs.
          </p>
          <button type="button" class="primary big" onClick={step.onLoad}>
            Load reviews on this page
          </button>
          {step.onAnalyse && (
            <p class="small muted">
              You already have enough reviews.{' '}
              <button type="button" class="link underline" onClick={step.onAnalyse}>
                Find themes now
              </button>
            </p>
          )}
        </>
      )}

      {step.kind === 'rerun' && (
        <>
          <p class="hint">
            {step.newReviews} new review{step.newReviews === 1 ? '' : 's'} since your last analysis.
          </p>
          <button type="button" class="primary big" onClick={step.onRerun}>
            Re-run analysis
          </button>
        </>
      )}

      {step.kind === 'loading' && (
        <>
          <p class="hint">Loading reviews… {step.loaded} / 100</p>
          <progress max={100} value={step.loaded} />
          <button type="button" class="big" onClick={step.onStop}>
            Stop
          </button>
        </>
      )}

      {step.kind === 'open-next' && (
        <>
          <p class="hint">
            Amazon shows at most 100 reviews here. Need {need(step.reviewsNeeded, step.monthsNeeded)}. Open the next
            filter:
          </p>
          <button type="button" class="primary big" onClick={step.onOpen}>
            Open: {step.nextLabel}
          </button>
        </>
      )}

      {step.kind === 'find-themes' && (
        <>
          <p class="hint">{step.reviews} reviews collected, enough to analyse.</p>
          <button type="button" class="primary big" onClick={step.onRun}>
            Find themes
          </button>
          {step.onMore && step.moreLabel && (
            <p class="small muted">
              Optional: more reviews make changes easier to detect.{' '}
              <button type="button" class="link underline" onClick={step.onMore}>
                Open: {step.moreLabel}
              </button>
            </p>
          )}
        </>
      )}

      {step.kind === 'analysing' && <p class="hint">Analysing… {step.stage}</p>}

      {step.kind === 'done' && (
        <>
          <p class="hint">Done. Results are below ↓</p>
          <button type="button" class="big" onClick={step.onRerun}>
            Re-run analysis
          </button>
        </>
      )}

      {error && <p class="small warn">{error}</p>}
    </section>
  );
}
