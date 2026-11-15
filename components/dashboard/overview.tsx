import type React from "react";

export function Kpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <article className={`kpi ${tone}`}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <b>{value}</b>
      </div>
    </article>
  );
}
export function PanelTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="panel-title">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
export function Chart({
  title,
  rows,
  onPick,
}: {
  title: string;
  rows: [string, number][];
  onPick: (v: string) => void;
}) {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return (
    <section className="panel">
      <PanelTitle
        title={title}
        subtitle="Click a bar to filter the task registry"
      />
      <div className="bars">
        {rows.slice(0, 7).map(([name, value]) => (
          <button key={name} onClick={() => onPick(name)}>
            <span>{name}</span>
            <i>
              <b style={{ width: `${(value / max) * 100}%` }} />
            </i>
            <em>{value}</em>
          </button>
        ))}
      </div>
    </section>
  );
}
