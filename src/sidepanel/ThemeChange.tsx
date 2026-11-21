// Per-theme picture of "before vs after" and the change with its range.
// Compact: the key is shown once per card, details are folded (DECISIONS #41).

import type { ShiftResult, ThemeSeries } from '../types';

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

const shortMonth = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1] ?? '?'} ’${iso.slice(2, 4)}`;
const time = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/**
 * Month-by-month share of reviews mentioning the theme (Phase 6): one point per
 * time bucket with its Wilson range shaded, the before/after averages as flat
 * segments, and a dashed marker at the split month.
 */
export function Sparkline({ s, series }: { s: ShiftResult; series: ThemeSeries }) {
  const b = series.buckets;
  if (b.length === 0) return null;
  // Top margin leaves room for the split-month label below the verdict chip (DECISIONS #45).
  const H = 70;
  const left = 30;
  const right = W - 6;
  const topY = 18;
  const baseY = H - 14;
  const t0 = time(b[0]?.start ?? s.changeAt);
  const t1 = time(b[b.length - 1]?.end ?? s.changeAt);
  const x = (iso: string) => left + ((time(iso) - t0) / Math.max(1, t1 - t0)) * (right - left);
  const mid = (start: string, end: string) => new Date((time(start) + time(end)) / 2).toISOString().slice(0, 10);
  const yMax = Math.min(1, Math.max(0.1, ...b.map((k) => k.ci[1]), s.before.share, s.after.share) * 1.05);
  const y = (share: number) => baseY - (share / yMax) * (baseY - topY);

  const pts = b.map((k) => ({ x: x(mid(k.start, k.end)), y: y(k.share), lo: y(k.ci[0]), hi: y(k.ci[1]) }));
  const band = [...pts.map((p) => `${p.x},${p.hi}`), ...[...pts].reverse().map((p) => `${p.x},${p.lo}`)].join(' ');
  const line = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const xc = x(s.changeAt);
  const before = pct(s.before.share);
  const after = pct(s.after.share);

  return (
    <svg
      class="tchange spark"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`Monthly share of reviews mentioning this theme, ${shortMonth(b[0]?.start ?? '')} to ${shortMonth(b[b.length - 1]?.end ?? '')}: average ${before}% before ${monthName(s.changeAt)} and ${after}% after.`}
    >
      <text x={left - 3} y={topY + 3} class="tc-tick" text-anchor="end">{pct(yMax)}%</text>
      <text x={left - 3} y={baseY + 2} class="tc-tick" text-anchor="end">0%</text>
      <line x1={left} x2={right} y1={baseY} y2={baseY} class="tc-axis" />
      <polygon points={band} class="sp-band" />
      <polyline points={line} class="sp-line" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="1.8" class="sp-dot" />
      ))}
      {/* averages before and after the split */}
      <line x1={left} x2={xc} y1={y(s.before.share)} y2={y(s.before.share)} class="sp-avg before" />
      <line x1={xc} x2={right} y1={y(s.after.share)} y2={y(s.after.share)} class="sp-avg after" />
      <text x={left + 2} y={y(s.before.share) - 3} class="tc-val sp-avg-label">{before}%</text>
      <text x={right - 2} y={y(s.after.share) - 3} class="tc-val sp-avg-label" text-anchor="end">{after}%</text>
      {/* split month */}
      <line x1={xc} x2={xc} y1={topY - 4} y2={baseY} class="tc-zero" />
      <text
        x={Math.min(right - 14, Math.max(left + 14, xc))}
        y={topY - 7}
        class="tc-tick"
        text-anchor="middle"
      >
        split {shortMonth(s.changeAt)}
      </text>
      <text x={left} y={H - 2} class="tc-tick">{shortMonth(b[0]?.start ?? '')}</text>
      <text x={right} y={H - 2} class="tc-tick" text-anchor="end">{shortMonth(b[b.length - 1]?.end ?? '')}</text>
    </svg>
  );
}

/** The change box: dot = change seen, box = where the true change could be, dashed = 0. */
export function ChangeBox({ s }: { s: ShiftResult }) {
  const d = Math.round(100 * s.diff);
  const lo = Math.round(100 * s.diffCi[0]);
  const hi = Math.round(100 * s.diffCi[1]);
  const span = Math.max(Math.abs(lo), Math.abs(hi), Math.abs(d), 5) * 1.15;
  const x = (v: number) => LABEL_W + ((v + span) / (2 * span)) * (W - LABEL_W - 6);
  const tone = s.significant ? (d > 0 ? 'var(--up)' : 'var(--down)') : 'var(--band)';

  return (
    <svg
      class="tchange"
      viewBox={`0 0 ${W} 36`}
      width="100%"
      role="img"
      aria-label={`Change ${signed(d)} points; the true change could be between ${signed(lo)} and ${signed(hi)}.`}
    >
      <text x="0" y="16" class="tc-lab">Change</text>
      <line x1={LABEL_W} x2={W - 6} y1="12" y2="12" class="tc-axis" />
      <rect
        x={x(lo)}
        y="5"
        width={Math.max(2, x(hi) - x(lo))}
        height="14"
        rx="3"
        style={{ fill: tone, fillOpacity: 0.25, stroke: tone, strokeWidth: 1.2 }}
      />
      <line x1={x(0)} x2={x(0)} y1="1" y2="23" class="tc-zero" />
      <circle cx={x(d)} cy="12" r="4.5" style={{ fill: tone }} />
      <text x={x(d)} y="32" class="tc-dot" text-anchor="middle">{signed(d)}</text>
      <text x={x(0) + 3} y="32" class="tc-tick">{x(d) > x(0) - 14 && x(d) < x(0) + 14 ? '' : '0'}</text>
    </svg>
  );
}

/** Chart block for one theme: monthly line, then the change box. */
export function ThemeChange({ s, series }: { s: ShiftResult; series?: ThemeSeries }) {
  return (
    <>
      {series && <Sparkline s={s} series={series} />}
      <ChangeBox s={s} />
    </>
  );
}

/** "40 per 100 reviews before → between 14 and 50 after" for the Details text. */
export function per100(beforeShare: number, lo: number, hi: number): string {
  const b = pct(beforeShare);
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  return `out of every 100 reviews, ${clamp(b + lo)} to ${clamp(b + hi)} instead of ${b}`;
}
