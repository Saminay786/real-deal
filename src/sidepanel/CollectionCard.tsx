import { formatMonthSpan, MIN_MONTHS, MIN_REVIEWS, type CollectionSummary } from '../collect/summary';

const fmt = (n: number) => n.toLocaleString('en-IN');

export function CollectionCard({ s }: { s: CollectionSummary; onReviewsPage?: boolean }) {
  const span = formatMonthSpan(s.earliest, s.latest);
  const needs: string[] = [];
  if (s.reviewsNeeded > 0) needs.push(`${fmt(s.reviewsNeeded)} more review${s.reviewsNeeded === 1 ? '' : 's'}`);
  if (s.monthsNeeded > 0) needs.push(`${s.monthsNeeded} more month${s.monthsNeeded === 1 ? '' : 's'} of history`);

  return (
    <section class="card">
      <h2>Reviews collected</h2>
      <p class="big">
        <strong>{fmt(s.usable)}</strong> review{s.usable === 1 ? '' : 's'} captured
        {s.totalOnAmazon !== null && s.totalOnAmazon > 0 && (
          <span class="muted">
            {' '}
            of {fmt(s.totalOnAmazon)} on Amazon ({Math.min(100, Math.round((100 * s.captured) / s.totalOnAmazon))}%)
          </span>
        )}
      </p>
      <p>
        {s.months > 0 ? (
          <>
            <strong>
              {s.months} month{s.months === 1 ? '' : 's'}
            </strong>
            {span && <span class="muted"> · {span}</span>}
          </>
        ) : (
          <span class="muted">No dated reviews yet</span>
        )}
      </p>
      <p class={s.minimumMet ? 'ok' : 'todo'}>
        {s.minimumMet ? '✓ Enough to analyse' : `Need ${needs.join(' and ')}`}
        <span class="muted">
          {' '}
          (minimum {MIN_REVIEWS} reviews over {MIN_MONTHS} months)
        </span>
      </p>
      {s.otherCountries > 0 && (
        <p class="muted small">
          +{fmt(s.otherCountries)} from other countries, kept but not analysed.
        </p>
      )}
    </section>
  );
}
