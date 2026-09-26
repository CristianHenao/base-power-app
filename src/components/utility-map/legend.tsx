"use client";

/** A five-step ramp with a label under each step, plus a title and optional note. */
export function SequentialLegend({
  title,
  colors,
  labels,
  note,
}: {
  title: string;
  colors: readonly string[];
  labels: readonly string[];
  note?: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[12px] leading-[18px] font-semibold text-muted-foreground">{title}</p>
      <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${colors.length}, minmax(0, 1fr))` }}>
        {colors.map((color, i) => (
          <li key={color} className="space-y-1">
            <span className="block h-3 rounded-sm ring-1 ring-black/10" style={{ backgroundColor: color }} aria-hidden />
            <span className="block text-[11px] leading-tight text-muted-foreground">{labels[i]}</span>
          </li>
        ))}
      </ol>
      {note ? <p className="text-[11px] leading-tight text-muted-foreground">{note}</p> : null}
    </div>
  );
}
