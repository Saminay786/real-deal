// Chooses which collected reviews the burst check may use. Pure.
//
// Star-filtered views hold the 100 *most recent* reviews of one star level, so
// on a popular product the 5★ view covers only the last weeks: mixed with older
// reviews that looks exactly like a recent burst of glowing reviews. The check
// therefore uses all reviews only when every review was collected; otherwise
// only reviews seen in views without a star filter (DECISIONS #49).

import type { BurstReview } from '../stats/burst';
import type { Review } from '../types';
import type { StoredView } from './store';
import { ANALYSED_COUNTRY } from './summary';

export interface BurstSelection {
  reviews: BurstReview[];
  basis: 'all' | 'unfiltered' | 'none';
}

export function burstReviews(
  reviews: readonly Review[],
  views: readonly Pick<StoredView, 'view' | 'reviewIds'>[],
  totalOnAmazon: number | null,
): BurstSelection {
  const usable = reviews.filter((r) => r.country === ANALYSED_COUNTRY && r.date && r.reviewId);
  const toInput = (rs: readonly Review[]): BurstReview[] =>
    rs.map((r) => ({ date: r.date as string, rating: r.rating, verified: r.verified }));

  if (totalOnAmazon !== null && reviews.length >= totalOnAmazon) return { reviews: toInput(usable), basis: 'all' };

  const unfilteredIds = new Set(views.filter((v) => v.view.star === 'all').flatMap((v) => v.reviewIds));
  if (unfilteredIds.size === 0) return { reviews: [], basis: 'none' };
  return { reviews: toInput(usable.filter((r) => unfilteredIds.has(r.reviewId as string))), basis: 'unfiltered' };
}
