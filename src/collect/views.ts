// Review "views": one sort/filter combination of Amazon's review list. Amazon
// shows at most 100 reviews per view, so reaching more of a product's history
// means visiting several views. Pure: no DOM, no chrome.*, no IndexedDB.

export type Sort = 'recent' | 'helpful';
export type StarFilter = 'all' | 1 | 2 | 3 | 4 | 5;
export type ReviewerFilter = 'all' | 'verified';

export interface ReviewView {
  sort: Sort;
  star: StarFilter;
  reviewer: ReviewerFilter;
}

/** Amazon shows at most this many reviews per view (measured 2026-11-15). */
export const VIEW_CAP = 100;

const STAR_PARAM: Record<string, StarFilter> = {
  one_star: 1,
  two_star: 2,
  three_star: 3,
  four_star: 4,
  five_star: 5,
};
const STAR_TO_PARAM: Record<Exclude<StarFilter, 'all'>, string> = {
  1: 'one_star',
  2: 'two_star',
  3: 'three_star',
  4: 'four_star',
  5: 'five_star',
};

/** Reads the view from a review-page URL. Missing or unknown params mean Amazon's defaults. */
export function viewFromUrl(url: string): ReviewView {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    params = new URLSearchParams();
  }
  return {
    sort: params.get('sortBy') === 'recent' ? 'recent' : 'helpful',
    star: STAR_PARAM[params.get('filterByStar') ?? ''] ?? 'all',
    reviewer: params.get('reviewerType') === 'avp_only_reviews' ? 'verified' : 'all',
  };
}

export function viewKey(v: ReviewView): string {
  return `${v.sort}|${v.star}|${v.reviewer}`;
}

/**
 * URL that opens this view of a product's reviews (the user clicks; nothing is fetched).
 * Reuses the path of the review page the user is on, if any, so Amazon's current
 * URL scheme (/portal/customer-reviews/…) is kept.
 */
export function viewUrl(asin: string, v: ReviewView, currentUrl?: string): string {
  const p = new URLSearchParams({
    reviewerType: v.reviewer === 'verified' ? 'avp_only_reviews' : 'all_reviews',
    sortBy: v.sort === 'recent' ? 'recent' : 'helpful',
  });
  if (v.star !== 'all') p.set('filterByStar', STAR_TO_PARAM[v.star]);
  let path = `/product-reviews/${asin}/`;
  if (currentUrl) {
    try {
      const u = new URL(currentUrl);
      if (/\/(product-reviews|portal\/customer-reviews)\//.test(u.pathname) && u.pathname.includes(asin)) {
        path = u.pathname;
      }
    } catch {
      // keep the default path
    }
  }
  return `https://www.amazon.in${path}?${p.toString()}`;
}

export function viewLabel(v: ReviewView): string {
  const parts = [v.sort === 'recent' ? 'Most recent' : 'Top reviews', v.star === 'all' ? 'all stars' : `${v.star}★`];
  if (v.reviewer === 'verified') parts.push('verified only');
  return parts.join(' · ');
}

const STARS: StarFilter[] = ['all', 5, 4, 3, 2, 1];

/**
 * Suggested order. Most recent first (newest history per star level), then Top
 * reviews (a different 100, often older), then verified-only (another window).
 */
export const PLAN: readonly ReviewView[] = [
  ...STARS.map((star): ReviewView => ({ sort: 'recent', star, reviewer: 'all' })),
  ...STARS.map((star): ReviewView => ({ sort: 'helpful', star, reviewer: 'all' })),
  ...STARS.filter((s) => s !== 'all').map((star): ReviewView => ({ sort: 'recent', star, reviewer: 'verified' })),
];

export interface ViewProgress {
  /** Distinct reviews captured while this view was open. */
  seen: number;
  /** Reviews Amazon says match this view ("212 customer reviews"), if shown. */
  total: number | null;
}

export type ViewStatus = 'todo' | 'partial' | 'capped' | 'complete';

/**
 * - complete: every review in the view was captured (seen ≥ total);
 * - capped: 100 captured, Amazon will not show more in this view;
 * - partial: started, keep clicking "Show 10 more";
 * - todo: not opened yet.
 */
export function viewStatus(p: ViewProgress | undefined): ViewStatus {
  if (!p || p.seen === 0) return 'todo';
  if (p.total !== null && p.seen >= p.total) return 'complete';
  if (p.seen >= VIEW_CAP) return 'capped';
  return 'partial';
}

/** First planned view that is not finished (partial before todo, so started views get finished). */
export function nextView(progress: ReadonlyMap<string, ViewProgress>): ReviewView | null {
  const partial = PLAN.find((v) => viewStatus(progress.get(viewKey(v))) === 'partial');
  if (partial) return partial;
  return PLAN.find((v) => viewStatus(progress.get(viewKey(v))) === 'todo') ?? null;
}
