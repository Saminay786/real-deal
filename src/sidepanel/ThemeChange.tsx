// Per-theme picture of "before vs after" and the change with its range.
// Compact: the key is shown once per card, details are folded (DECISIONS #41).

import type { ShiftResult } from '../types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthName = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1] ?? '?'} ${iso.slice(0, 4)}`;
const pct = (x: number) => Math.round(100 * x);
export const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;

/** "from a 6-point drop to a 24-point rise", "from a 3-point rise to a 20-point rise", … */
export function rangeWords(lo: number, hi: number): string {
  // "an" before numbers said with a vowel sound: 8, 11, 18, 80–89.
  const article = (n: number) => (/^(8|11|18)(\d*)$/.test(String(n)) && !/^1[1-8]\d/.test(String(n)) ? 'an' : 'a');
  const word = (v: number) =>
    v === 0 ? 'no change' : `${article(Math.abs(v))} ${Math.abs(v)}-point ${v < 0 ? 'drop' : 'rise'}`;
  return `from ${word(lo)} to ${word(hi)}`;
}

export type Verdict = 'real' | 'luck' | 'not-proven';

export function verdictOf(s: ShiftResult): Verdict {
  if (s.significant) return 'real';
  const lo = Math.round(100 * s.diffCi[0]);
  const hi = Math.round(100 * s.diffCi[1]);
  return lo <= 0 && hi >= 0 ? 'luck' : 'not-proven';
}

export const VERDICT_TEXT: Record<Verdict, string> = {
  real: 'Real change',
  luck: 'Could just be luck',
  'not-proven': 'Not proven',
};

const W = 240;
const LABEL_W = 64;

/** The graph: before/after bars and the change box. No legend here: one key per card. */
export function ThemeChange({ s }: { s: ShiftResult }) {
  const before = pct(s.before.share);
  const after = pct(s.after.share);
  const d = Math.round(100 * s.diff);
  const lo = Math.round(100 * s.diffCi[0]);
  const hi = Math.round(100 * s.diffCi[1]);
  const when = monthName(s.changeAt);

  const barMax = W - LABEL_W - 34;
  const top = Math.max(before, after, 10) * 1.1;
  const bw = (v: number) => (barMax * v) / top;

  const span = Math.max(Math.abs(lo), Math.abs(hi), Math.abs(d), 5) * 1.15;
  const x = (v: number) => LABEL_W + ((v + span) / (2 * span)) * (W - LABEL_W - 6);
  const tone = s.significant ? (d > 0 ? 'var(--up)' : 'var(--down)') : 'var(--band)';

  return (
    <svg
      class="tchange"
      viewBox={`0 0 ${W} 70`}
      width="100%"
      role="img"
      aria-label={`Before ${when}: ${before}%. After: ${after}%. Change ${signed(d)} points, true change between ${signed(lo)} and ${signed(hi)}.`}
    >
      <text x="0" y="11" class="tc-lab">Before</text>
      <rect x={LABEL_W} y="3" width={bw(before)} height="10" rx="2" class="tc-bar before" />
      <text x={LABEL_W + bw(before) + 4} y="11" class="tc-val">{before}%</text>

      <text x="0" y="26" class="tc-lab">After</text>
      <rect x={LABEL_W} y="18" width={bw(after)} height="10" rx="2" class="tc-bar after" />
      <text x={LABEL_W + bw(after) + 4} y="26" class="tc-val">{after}%</text>

      <text x="0" y="50" class="tc-lab">Change</text>
      <line x1={LABEL_W} x2={W - 6} y1="46" y2="46" class="tc-axis" />
      <rect
        x={x(lo)}
        y="39"
        width={Math.max(2, x(hi) - x(lo))}
        height="14"
        rx="3"
        style={{ fill: tone, fillOpacity: 0.25, stroke: tone, strokeWidth: 1.2 }}
      />
      <line x1={x(0)} x2={x(0)} y1="35" y2="57" class="tc-zero" />
      <circle cx={x(d)} cy="46" r="4.5" style={{ fill: tone }} />
      <text x={x(d)} y="66" class="tc-dot" text-anchor="middle">{signed(d)}</text>
      <text x={x(0)} y="33" class="tc-tick" text-anchor="middle">0</text>
    </svg>
  );
}
