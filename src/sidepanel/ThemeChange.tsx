// Per-theme picture of "before vs after" and the change with its range
// (the user asked for a visual for each number, DECISIONS #37). Inline SVG.

import type { ShiftResult } from '../types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const month = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1] ?? '?'} ${iso.slice(0, 4)}`;
const pct = (x: number) => Math.round(100 * x);
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;

/** "from a 6-point drop to a 24-point rise", "from a 3-point rise to a 20-point rise", … */
export function rangeWords(lo: number, hi: number): string {
  // "an" before numbers said with a vowel sound: 8, 11, 18, 80–89.
  const article = (n: number) => (/^(8|11|18)(\d*)$/.test(String(n)) && !/^1[1-8]\d/.test(String(n)) ? 'an' : 'a');
  const word = (v: number) =>
    v === 0 ? 'no change' : `${article(Math.abs(v))} ${Math.abs(v)}-point ${v < 0 ? 'drop' : 'rise'}`;
  return `from ${word(lo)} to ${word(hi)}`;
}

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
      <svg viewBox={`0 0 ${W} 100`} width="100%" role="img" aria-label={`Before ${before}%, after ${after}%, change ${signed(d)} points, likely between ${signed(lo)} and ${signed(hi)}`}>
        {/* before / after bars */}
        <text x="0" y="13" class="tc-lab">Before {when}</text>
        <rect x={LABEL_W} y="4" width={bw(before)} height="11" rx="2" class="tc-bar before" />
        <text x={LABEL_W + bw(before) + 4} y="13" class="tc-val">{before}%</text>

        <text x="0" y="31" class="tc-lab">After {when}</text>
        <rect x={LABEL_W} y="22" width={bw(after)} height="11" rx="2" class="tc-bar after" />
        <text x={LABEL_W + bw(after) + 4} y="31" class="tc-val">{after}%</text>

        {/* change: range band, zero line, dot (labelled, DECISIONS #39) */}
        <text x="0" y="58" class="tc-lab">Change</text>
        <text x={LABEL_W} y="42" class="tc-tick">← fewer mentions</text>
        <text x={W - 8} y="42" class="tc-tick" text-anchor="end">more mentions →</text>
        <line x1={LABEL_W} x2={W - 8} y1="54" y2="54" class="tc-axis" />
        <rect x={x(lo)} y="49" width={Math.max(2, x(hi) - x(lo))} height="10" rx="5" style={{ fill: tone, opacity: 0.25 }} />
        <line x1={x(0)} x2={x(0)} y1="45" y2="63" class="tc-zero" />
        <circle cx={x(d)} cy="54" r="4.5" style={{ fill: tone }} />
        <text x={x(d)} y="72" class="tc-dot" text-anchor="middle">{signed(d)} seen</text>
        <text x={x(lo)} y="84" class="tc-tick" text-anchor="middle">{signed(lo)}</text>
        <text x={x(hi)} y="84" class="tc-tick" text-anchor="middle">{signed(hi)}</text>
        <text x={x(0)} y="96" class="tc-tick" text-anchor="middle">┆ 0 = no change</text>
      </svg>
      <p class="small muted tc-key">
        ● dot = change seen in these reviews · shaded band = where the true change could be · ┆ dashed line = no change
      </p>
      <p class="small tc-caption">
        Mentions went from <strong>{before}%</strong> to <strong>{after}%</strong> of reviews ({signed(d)} points). The
        true change could be anything {rangeWords(lo, hi)}.{' '}
        {s.significant ? (
          <span class="ok">
            <strong>Real change.</strong> A jump this big is very unlikely to be luck.
          </span>
        ) : crossesZero ? (
          <span class="muted">
            <strong>Could just be luck.</strong> With only {s.before.n} reviews before and {s.after.n} after, a gap this
            size often shows up even when nothing really changed.
          </span>
        ) : (
          <span class="muted">
            <strong>Looks like a change, but not proven.</strong> We checked every month to find the biggest jump, and
            jumps this big still turn up by luck.
          </span>
        )}
      </p>
    </div>
  );
}
