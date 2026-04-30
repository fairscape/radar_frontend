import { Glyph } from './Glyph';

export function Chip({
  label,
  value,
  onClick,
  active,
}: {
  label: string;
  value: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <div className={`top-chip ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="lbl">{label}</span>
      <span>{value}</span>
      <Glyph name="chev-d" size={10} />
    </div>
  );
}
