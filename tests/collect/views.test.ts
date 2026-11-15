import { describe, expect, it } from 'vitest';
import {
  PLAN,
  nextView,
  viewFromUrl,
  viewKey,
  viewLabel,
  viewStatus,
  viewUrl,
  type ViewProgress,
} from '../../src/collect/views';

describe('viewFromUrl', () => {
  it('reads the URLs seen on amazon.in', () => {
    // Saved fixture reviews-a-p1
    expect(
      viewFromUrl(
        'https://www.amazon.in/portal/customer-reviews/B0CCM8L54V/ref=cm_cr_arp_d_viewopt_srt?_encoding=UTF8&ie=UTF8&reviewerType=all_reviews&sortBy=recent',
      ),
    ).toEqual({ sort: 'recent', star: 'all', reviewer: 'all' });
    // Default (no sortBy) is Amazon's "Top reviews"
    expect(
      viewFromUrl(
        'https://www.amazon.in/portal/customer-reviews/B0HB6VXMJ6/ref=cm_cr_dp_d_show_all_top?_encoding=UTF8&ie=UTF8&reviewerType=all_reviews',
      ),
    ).toEqual({ sort: 'helpful', star: 'all', reviewer: 'all' });
  });

  it('reads star and verified filters', () => {
    expect(
      viewFromUrl('https://www.amazon.in/product-reviews/B0CCM8L54V/?sortBy=recent&filterByStar=three_star&reviewerType=avp_only_reviews'),
    ).toEqual({ sort: 'recent', star: 3, reviewer: 'verified' });
  });

  it('never throws on junk', () => {
    expect(viewFromUrl('not a url')).toEqual({ sort: 'helpful', star: 'all', reviewer: 'all' });
  });
});

describe('viewUrl', () => {
  it('round-trips through viewFromUrl for every planned view', () => {
    for (const v of PLAN) expect(viewFromUrl(viewUrl('B0CCM8L54V', v))).toEqual(v);
  });

  it('keeps the review-page path the user is on', () => {
    const cur = 'https://www.amazon.in/portal/customer-reviews/B0CCM8L54V/ref=x?sortBy=recent';
    const url = viewUrl('B0CCM8L54V', { sort: 'recent', star: 1, reviewer: 'all' }, cur);
    expect(url).toBe(
      'https://www.amazon.in/portal/customer-reviews/B0CCM8L54V/ref=x?reviewerType=all_reviews&sortBy=recent&filterByStar=one_star',
    );
    // From a product page it falls back to /product-reviews/
    expect(viewUrl('B0CCM8L54V', PLAN[0] ?? { sort: 'recent', star: 'all', reviewer: 'all' }, 'https://www.amazon.in/x/dp/B0CCM8L54V')).toMatch(
      /^https:\/\/www\.amazon\.in\/product-reviews\/B0CCM8L54V\/\?/,
    );
  });
});

describe('viewStatus / nextView', () => {
  it('classifies progress', () => {
    expect(viewStatus(undefined)).toBe('todo');
    expect(viewStatus({ seen: 0, total: null })).toBe('todo');
    expect(viewStatus({ seen: 40, total: 1283 })).toBe('partial');
    expect(viewStatus({ seen: 100, total: 1283 })).toBe('capped');
    expect(viewStatus({ seen: 61, total: 61 })).toBe('complete'); // e.g. 2★ has only 61 reviews
    expect(viewStatus({ seen: 100, total: 100 })).toBe('complete');
  });

  it('suggests unfinished views first, then the planned order', () => {
    const p = new Map<string, ViewProgress>();
    expect(nextView(p)).toEqual(PLAN[0]);
    p.set(viewKey({ sort: 'recent', star: 'all', reviewer: 'all' }), { seen: 100, total: 1283 });
    expect(nextView(p)).toEqual({ sort: 'recent', star: 5, reviewer: 'all' });
    p.set(viewKey({ sort: 'recent', star: 2, reviewer: 'all' }), { seen: 20, total: 61 });
    expect(nextView(p)).toEqual({ sort: 'recent', star: 2, reviewer: 'all' }); // partial wins
    for (const v of PLAN) p.set(viewKey(v), { seen: 100, total: null });
    expect(nextView(p)).toBeNull();
  });

  it('labels views readably and plans 17 distinct views', () => {
    expect(viewLabel({ sort: 'recent', star: 3, reviewer: 'verified' })).toBe('Most recent · 3★ · verified only');
    expect(viewLabel({ sort: 'helpful', star: 'all', reviewer: 'all' })).toBe('Top reviews · all stars');
    expect(new Set(PLAN.map(viewKey)).size).toBe(17); // 6 recent + 6 top + 5 verified
  });
});
