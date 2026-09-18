export function ErrorLine({ text }: { text: string }) {
  return (
    <div
      className="mono"
      style={{
        marginTop: 12,
        padding: 8,
        fontSize: 11,
        color: 'var(--err)',
        background: 'color-mix(in oklab, var(--bg-0), var(--err) 4%)',
        borderLeft: '2px solid var(--err)',
      }}
    >
      {text}
    </div>
  );
}
