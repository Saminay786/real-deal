// Page-type routing. Pure: no DOM, no chrome.* APIs.

export type PageType = 'product' | 'reviews' | 'search' | 'other';

export function pageType(pathname: string): PageType {
  // amazon.in serves review lists at both /product-reviews/ and /portal/customer-reviews/.
  if (/\/(product-reviews|portal\/customer-reviews)\//.test(pathname)) return 'reviews';
  if (/\/(dp|gp\/product)\//.test(pathname)) return 'product';
  if (pathname === '/s' || pathname.startsWith('/s/')) return 'search';
  return 'other';
}

/** ASIN from a product or review page path, e.g. /portal/customer-reviews/B0CCM8L54V/… */
export function asinFromPath(pathname: string): string | null {
  return pathname.match(/\/(?:dp|gp\/product|product-reviews|customer-reviews)\/([A-Z0-9]{10})(?:[/?]|$)/)?.[1] ?? null;
}
