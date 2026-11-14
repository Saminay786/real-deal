// Content script entry: routes by page type. Pipelines are added in later phases.

export type PageType = 'product' | 'reviews' | 'search' | 'other';

export function pageType(pathname: string): PageType {
  if (/\/product-reviews\//.test(pathname)) return 'reviews';
  if (/\/(dp|gp\/product)\//.test(pathname)) return 'product';
  if (pathname === '/s' || pathname.startsWith('/s/')) return 'search';
  return 'other';
}
