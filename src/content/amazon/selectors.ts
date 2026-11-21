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

/** Review list pages (/portal/customer-reviews/<ASIN>, /product-reviews/<ASIN>). */
export const REVIEWS = {
  /** One element per review; its `id` is the review ID (e.g. "R3RST0O7ZS3260"). */
  review: ['li[data-hook="review"]', 'div[data-hook="review"]', '[data-hook="review"]'],
  /** Container the reviews are appended to when the user clicks "Show 10 more". */
  list: ['#cm_cr-review_list', '[data-hook="review-list"]', '#cm-cr-dp-review-list'],
  rating: ['[data-hook="review-star-rating"]', '[data-hook="cmps-review-star-rating"]'],
  title: ['[data-hook="review-title"]'],
  body: ['[data-hook="review-body"]'],
  date: ['[data-hook="review-date"]'],
  verified: ['[data-hook="avp-badge"]', '[data-hook="avp-badge-linkless"]'],
  variant: ['[data-hook="format-strip"]', '[data-hook="format-strip-linkless"]'],
  /** Separator icons between variant parts ("Size: … | Colour: …"). */
  variantSeparator: ['.a-icon-text-separator'],
  helpful: ['[data-hook="helpful-vote-statement"]'],
  /** "by <brand>" under the product title on review pages; its link text is the brand. */
  brand: ['[data-hook="cr-product-byline"] a', '#bylineInfo'],
  /** "1,283 customer reviews" (changes when a star filter is applied). */
  totalReviews: ['[data-hook="cr-filter-info-review-rating-count"]'],
  /** "Show 10 more reviews" button (AJAX, appends to the list). */
  showMore: ['a[data-hook="show-more-button"]', '#cm_cr-pagination_bar .cm-cr-show-more a', '#cm_cr-pagination_bar a'],
  /** Amazon's robot check. If present, stop immediately. */
  captcha: ['form[action*="validateCaptcha"]', '#captchacharacters', 'form[action*="/errors/validateCaptcha"]'],
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
