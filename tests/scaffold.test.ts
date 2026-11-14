import { describe, expect, it } from 'vitest';
import manifest from '../src/manifest.json' with { type: 'json' };
import { pageType } from '../src/content/page';

describe('manifest', () => {
  it('is MV3 with a side panel', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.side_panel.default_path).toBe('src/sidepanel/index.html');
  });

  it('grants host access to amazon.in only', () => {
    expect(manifest.host_permissions).toEqual(['https://www.amazon.in/*']);
    for (const cs of manifest.content_scripts) {
      expect(cs.matches).toEqual(['https://www.amazon.in/*']);
    }
  });
});

describe('pageType', () => {
  it('routes amazon.in paths', () => {
    expect(pageType('/Some-Product/dp/B0ABCDEF12')).toBe('product');
    expect(pageType('/Some-Product/product-reviews/B0ABCDEF12')).toBe('reviews');
    expect(pageType('/portal/customer-reviews/B0CCM8L54V/ref=cm_cr_arp_d_viewopt_srt')).toBe('reviews');
    expect(pageType('/s')).toBe('search');
    expect(pageType('/gp/cart/view.html')).toBe('other');
  });
});
