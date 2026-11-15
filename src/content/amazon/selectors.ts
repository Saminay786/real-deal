// ALL amazon.in DOM selectors live here, nowhere else.
// Each list is tried in order; the first match wins. Amazon changes its markup
// often, so keep older variants as fallbacks rather than replacing them.

/** Product page (/dp/<ASIN>). */
export const PRODUCT = {
  /** Hidden form input; the canonical link can point at a different variant. */
  asinInput: ['input#ASIN', 'input[name="ASIN"]'],
  asinAttr: ['#averageCustomerReviews[data-asin]', '#dp[data-asin]'],
  title: ['#productTitle', '#title'],
  /** Element whose `title` attribute reads "4.0 out of 5 stars". */
  ratingTitleAttr: ['#acrPopover[title]'],
  /** Element whose text reads "4.0 out of 5 stars". */
  ratingText: ['#acrPopover .a-icon-alt', '#averageCustomerReviews .a-icon-alt', '[data-hook="rating-out-of-text"]'],
  /** Text like "(11,413)" or "11,413 ratings". */
  ratingCount: ['#acrCustomerReviewText', '[data-hook="total-review-count"]'],
  /**
   * Containers for the 1–5★ breakdown. Search is limited to these so star
   * labels in "similar products" carousels are never picked up.
   */
  histogramRoots: [
    '#dp_desktop_customerReviews_histogram_div',
    '#cm_cr_dp_d_rating_histogram',
    '#histogramTable',
    '#reviewsMedley',
    '#customerReviews',
  ],
  /** Inside a histogram root: elements labelled "5 stars represent 54% of ratings". */
  histogramRowLabel: ['[aria-label*="% of rating"]'],
  /** Where the badge goes: right after Amazon's own star rating. */
  badgeAnchor: ['#acrPopover', '#averageCustomerReviews'],
} as const;

/** Header elements showing the signed-in user's name and delivery address. Blanked in fixtures. */
export const PERSONAL_INFO_SELECTORS: readonly string[] = [
  '#nav-link-accountList-nav-line-1',
  '#nav-global-location-slot',
  '#glow-ingress-block',
  '#glow-ingress-line1',
  '#glow-ingress-line2',
  '#contextualIngressPt',
  '#contextualIngressPtLink',
  '#contextualIngressPtLabel',
  '#contextualIngressPtLabel_deliveryShortLine',
  '#nav-al-your-account',
  '#hmenu-customer-name',
];
