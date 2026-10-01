const MINUS = "−";

export function fmtPp(x: number): string {
  const v = Math.abs(x).toFixed(2);
  return x < 0 ? `${MINUS}${v}` : `+${v}`;
}
export function fmtRange(lo: number, hi: number): string {
  return `${fmtPp(lo)} to ${fmtPp(hi)}`;
}
export function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}
export function fmtPct(x: number): string {
  return `${x.toFixed(2)}%`;
}
