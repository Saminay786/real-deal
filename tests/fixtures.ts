// Test helper: load a saved amazon.in page as a Document (requires the happy-dom environment).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Fixture {
  doc: Document;
  /** The page URL recorded when the fixture was saved. */
  url: string;
}

export function loadFixture(name: string): Fixture {
  // Vitest runs from the project root.
  const html = readFileSync(resolve(process.cwd(), 'tests', 'fixtures', `${name}.html`), 'utf8');
  const url = html.match(/<!-- saved from (\S+)/)?.[1] ?? 'https://www.amazon.in/';
  // Drop <link> tags so happy-dom never tries to fetch Amazon's stylesheets: tests stay offline.
  const offline = html.replace(/<link\b[^>]*>/gi, '');
  const doc = new DOMParser().parseFromString(offline, 'text/html');
  return { doc, url };
}
