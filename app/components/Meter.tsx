/** 0〜1 の値を横棒で表示する。null は「—」 */
export function Meter({ value, title }: { value: number | null; title?: string }) {
  const pct = value === null ? null : Math.round(value * 100);
  return (
    <div className="meter" title={title ?? (pct === null ? "データなし" : `${pct}%`)}>
      <div className="track">{pct !== null && <div className="fill" style={{ width: `${pct}%` }} />}</div>
      <span className="pct">{pct === null ? "—" : `${pct}%`}</span>
    </div>
  );
}
