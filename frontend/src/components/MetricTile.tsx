interface MetricTileProps {
  label: string;
  value: string | number;
  unit?: string;
}

export default function MetricTile({ label, value, unit }: MetricTileProps) {
  return (
    <div className="rounded-card border border-border bg-white p-4">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted font-semibold">
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold text-ink leading-none">
        {value}
        {unit && (
          <span className="ml-1 text-sm text-body font-medium">{unit}</span>
        )}
      </p>
    </div>
  );
}
