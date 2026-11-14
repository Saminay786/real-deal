// Page-type routing. Pure: no DOM, no chrome.* APIs.

export type PageType = 'product' | 'reviews' | 'search' | 'other';

export function pageType(pathname: string): PageType {
  // amazon.in serves review lists at both /product-reviews/ and /portal/customer-reviews/.
  if (/\/(product-reviews|portal\/customer-reviews)\//.test(pathname)) return 'reviews';
  if (/\/(dp|gp\/product)\//.test(pathname)) return 'product';
  if (pathname === '/s' || pathname.startsWith('/s/')) return 'search';
  return 'other';
}
