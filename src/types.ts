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
}

export interface Theme {
  id: number;
  label: string;
  labelSource: 'ctfidf' | 'nano';
  topTerms: string[];
  size: number;
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
