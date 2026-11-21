// Shared data model. See CLAUDE.md "Data model". Any extracted field may be null.

export type Stars = 1 | 2 | 3 | 4 | 5;

export interface ProductSnapshot {
  asin: string | null;
  title: string | null;
  url: string;
  rating: number | null;
  ratingCount: number | null;
  /** Percentages per star, as shown by Amazon. */
  ratingDistribution: Record<Stars, number> | null;
  capturedAt: string;
}

export interface Review {
  reviewId: string | null;
  asin: string | null;
  rating: number | null;
  title: string | null;
  body: string | null;
  /** ISO yyyy-mm-dd */
  date: string | null;
  verified: boolean | null;
  helpfulVotes: number | null;
  /** Variant line as shown, e.g. "Size: 10 PACK | Colour: Photo Frame Hook". */
  variant: string | null;
  /** Country from "Reviewed in <country> on …", e.g. "India". */
  country: string | null;
}

/** Per-product metadata seen on review pages. */
export interface ProductMeta {
  asin: string;
  /** Written reviews on Amazon ("1,283 customer reviews"); largest value seen. */
  totalReviews: number | null;
  /** Brand from the review page ("by TIMEX"), kept out of theme labels. */
  brand?: string | null;
  updatedAt: string;
}

export interface Theme {
  id: number;
  label: string;
  labelSource: 'ctfidf' | 'nano';
  topTerms: string[];
  /** Number of sentences in the cluster. */
  size: number;
  /** The sentences closest to the cluster centre (most typical), up to 8. */
  samples: string[];
  /** Mean star rating of reviews mentioning the theme. */
  meanRating: number | null;
  /** Set by on-device AI labelling. */
  sentiment?: 'positive' | 'negative' | 'mixed' | 'neutral';
}

export interface SeriesBucket {
  start: string;
  end: string;
  n: number;
  k: number;
  share: number;
  ci: [number, number];
}

export interface ThemeSeries {
  themeId: number;
  buckets: SeriesBucket[];
}

export interface ShareCount {
  n: number;
  k: number;
  share: number;
}

export interface ShiftResult {
  themeId: number;
  label: string;
  changeAt: string;
  before: ShareCount;
  after: ShareCount;
  diff: number;
  diffCi: [number, number];
  pValue: number;
  qValue: number;
  significant: boolean;
  exemplars: { before: string[]; after: string[] };
}

export interface SearchResult {
  asin: string | null;
  title: string | null;
  url: string | null;
  rating: number | null;
  ratingCount: number | null;
  price: number | null;
  sponsored: boolean;
  position: number;
}

export type DataSufficiency = 'insufficient' | 'low' | 'ok';

export interface StatResult<T> {
  value: T | null;
  dataSufficiency: DataSufficiency;
  explanation: string;
}
