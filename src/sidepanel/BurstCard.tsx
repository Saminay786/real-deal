// "Review pattern check": busy periods and suspicious signals. Never says "fake".
import type { BurstSelection } from '../collect/burstInput';
import type { Burst } from '../stats/burst';
import type { StatResult } from '../types';

const date = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const pct = (x: number | null) => (x === null ? '?' : `${Math.round(100 * x)}%`);
const stars = (x: number | null) => (x === null ? '?' : `${x.toFixed(1)}★`);

const BASIS: Record<BurstSelection['basis'], string> = {
  all: 'Checked on every written review of this product.',
  unfiltered:
    'Checked only on reviews collected without star filters (star filters would make recent reviews look like a burst).',
  none: '',
};

export function BurstCard({ result, basis }: { result: StatResult<Burst>; basis: BurstSelection['basis'] }) {
  const b = result.value;
  return (
    <section class="card">
      <h2>Review pattern check</h2>
      {basis === 'none' || !b ? (
        <p class="small muted">
          {basis === 'none'
            ? 'Collect reviews with "Most recent · all stars" or "Top reviews · all stars" to check for unusual bursts.'
            : result.explanation}
        </p>
      ) : (
        <>
          {b.level === 'none' && <p class="ok">✓ No unusually busy period of reviews.</p>}
          {b.level !== 'none' && (
            <>
              <p class={b.level === 'suspicious' ? 'warn' : ''}>
                <strong>{b.level === 'suspicious' ? '⚠ Suspicious signals' : 'Busy period'}:</strong> {b.count} reviews in
                14 days from {date(b.start)} (normal pace: about {Math.max(1, Math.round(b.expected))}).
              </p>
              <ul class="small">
                {b.signals.includes('more-positive') && (
                  <li>
                    More positive than usual: {stars(b.meanRatingBurst)} vs {stars(b.meanRatingRest)} the rest of the time.
                  </li>
                )}
                {b.signals.includes('more-unverified') && (
                  <li>
                    Mostly unverified purchases: {pct(b.unverifiedBurst)} vs {pct(b.unverifiedRest)} the rest of the time.
                  </li>
                )}
                {b.level === 'busy' && (
                  <li>Ratings and verified share look like the rest of the time. Launches and sales cause bursts like this.</li>
                )}
              </ul>
              <p class="small muted">
                {b.level === 'suspicious'
                  ? 'This pattern can come from a giveaway or review campaign, but also from a launch programme such as Amazon Vine. It does not prove the reviews are fake. Read some reviews from those dates.'
                  : 'Not a warning by itself.'}
              </p>
            </>
          )}
          <p class="small muted">{BASIS[basis]}</p>
        </>
      )}
    </section>
  );
}
