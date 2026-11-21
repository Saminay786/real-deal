// Per-theme picture of "before vs after" and the change with its range
// (the user asked for a visual for each number, DECISIONS #37). Inline SVG.

import type { ShiftResult } from '../types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const month = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1] ?? '?'} ${iso.slice(0, 4)}`;
const pct = (x: number) => Math.round(100 * x);
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;

const W = 260;
const LABEL_W = 92;
const BAR_W = W - LABEL_W - 40;

export function ThemeChange({ s }: { s: ShiftResult }) {
  const before = pct(s.before.share);
  const after = pct(s.after.share);
  const d = Math.round(100 * s.diff);
  const lo = Math.round(100 * s.diffCi[0]);
  const hi = Math.round(100 * s.diffCi[1]);
  const crossesZero = lo <= 0 && hi >= 0;
  const when = month(s.changeAt);

  // Bars: scale to the larger share (at least 10%) so small shares stay visible.
  const top = Math.max(before, after, 10) * 1.15;
  const bw = (v: number) => (BAR_W * v) / top;

  // Change line: symmetric around 0.
  const span = Math.max(Math.abs(lo), Math.abs(hi), Math.abs(d), 5) * 1.15;
  const x = (v: number) => LABEL_W + ((v + span) / (2 * span)) * (W - LABEL_W - 8);
  const tone = s.significant ? (d > 0 ? 'var(--up)' : 'var(--down)') : 'var(--muted)';

  return (
    <div class="tchange">
      <svg viewBox={`0 0 ${W} 92`} width="100%" role="img" aria-label={`Before ${before}%, after ${after}%, change ${signed(d)} points, likely between ${signed(lo)} and ${signed(hi)}`}>
        {/* before / after bars */}
        <text x="0" y="13" class="tc-lab">Before {when}</text>
        <rect x={LABEL_W} y="4" width={bw(before)} height="11" rx="2" class="tc-bar before" />
        <text x={LABEL_W + bw(before) + 4} y="13" class="tc-val">{before}%</text>

        <text x="0" y="31" class="tc-lab">After {when}</text>
        <rect x={LABEL_W} y="22" width={bw(after)} height="11" rx="2" class="tc-bar after" />
        <text x={LABEL_W + bw(after) + 4} y="31" class="tc-val">{after}%</text>

        {/* change: range band, zero line, dot */}
        <text x="0" y="58" class="tc-lab">Change</text>
        <line x1={LABEL_W} x2={W - 8} y1="54" y2="54" class="tc-axis" />
        <rect x={x(lo)} y="49" width={Math.max(2, x(hi) - x(lo))} height="10" rx="5" style={{ fill: tone, opacity: 0.25 }} />
        <line x1={x(0)} x2={x(0)} y1="43" y2="65" class="tc-zero" />
        <circle cx={x(d)} cy="54" r="4.5" style={{ fill: tone }} />
        <text x={x(lo)} y="76" class="tc-tick" text-anchor="middle">{signed(lo)}</text>
        <text x={x(hi)} y="76" class="tc-tick" text-anchor="middle">{signed(hi)}</text>
        <text x={x(0)} y="88" class="tc-tick" text-anchor="middle">0 = no change</text>
      </svg>
      <p class="small tc-caption">
        Mentions went from <strong>{before}%</strong> to <strong>{after}%</strong> of reviews: a change of{' '}
        <strong>{signed(d)} points</strong>. The real change is likely between {signed(lo)} and {signed(hi)} points.{' '}
        {s.significant ? (
          <span class="ok">The range stays clear of 0 and the test confirms it: a real change.</span>
        ) : crossesZero ? (
          <span class="muted">The range includes 0, so this could be chance.</span>
        ) : (
          <span class="muted">
            The range misses 0, but it ignores that the tool picked the most dramatic month; the stricter test (p, q)
            says it could still be chance.
          </span>
        )}
      </p>
    </div>
  );
}
