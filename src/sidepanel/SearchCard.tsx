// Search page (Phase 8): results scored, sort this page by score, top picks.
import type { SearchInfo } from '../messages';
import { RANK_PRIOR_MEAN, RANK_PRIOR_WEIGHT } from '../stats/rating';

const fmt = (n: number) => n.toLocaleString('en-IN');

export function SearchCard({
  info,
  error,
  onSort,
  onRetry,
}: {
  info: SearchInfo | null;
  error: string | null;
  onSort: (byScore: boolean) => void;
  onRetry: () => void;
}) {
  if (error)
    return (
      <section class="card">
        <p class="small warn">{error}</p>
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      </section>
    );
  if (!info) return <section class="card"><p class="small muted">Reading search results…</p></section>;
  const scored = info.results.filter((r) => r.score !== null);
  const top = [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 5);
  const sponsored = info.results.filter((r) => r.sponsored).length;

  return (
    <section class="card">
      <h2>Search results</h2>
      <p>
        <strong>{scored.length}</strong> of {info.results.length} results scored
        {info.results.length - scored.length > 0 && (
          <span class="muted"> · {info.results.length - scored.length} have no ratings yet</span>
        )}
        {sponsored > 0 && <span class="muted"> · {sponsored} sponsored</span>}
      </p>
      <button type="button" class={info.sortedByScore ? 'big' : 'primary big'} onClick={() => onSort(!info.sortedByScore)}>
        {info.sortedByScore ? "Restore Amazon's order" : 'Sort this page by score'}
      </button>
      {top.length > 0 && (
        <>
          <p class="small muted" style={{ marginTop: '10px' }}>
            Top by score on this page:
          </p>
          <ol class="small toplist">
            {top.map((r) => (
              <li key={r.asin ?? r.position}>
                <strong>{r.score?.toFixed(2)}</strong> · {r.rating?.toFixed(1)}★ from {fmt(r.ratingCount ?? 0)} ·{' '}
                {(r.title ?? '').slice(0, 60)}
                {r.sponsored && <span class="muted"> · sponsored</span>}
              </li>
            ))}
          </ol>
        </>
      )}
      <details class="small">
        <summary>What is the score?</summary>
        <p>
          A cautious estimate of the true star rating. A product's average is blended with a typical rating (
          {RANK_PRIOR_MEAN}★, as if it had {RANK_PRIOR_WEIGHT} extra ordinary ratings), then lowered by its uncertainty.
          So 4.6★ from 9 ratings scores about 3.79, while 4.3★ from 2,000 ratings scores about 4.25: many ratings make
          a rating trustworthy. Sorting only reorders this page; it never loads other pages.
        </p>
      </details>
    </section>
  );
}
