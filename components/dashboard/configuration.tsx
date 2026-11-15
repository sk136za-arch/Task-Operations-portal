import { Plus } from "lucide-react";
import { PanelTitle } from "./overview";
import type { DueThresholds, Lookup } from "./types";

export function ConfigPanel({
  lookups,
  dueThresholds,
  busy,
  onSave,
  onSaveDue,
}: {
  lookups: Lookup[];
  dueThresholds: { red: number; yellow: number; gray: number };
  busy: boolean;
  onSave: (e: React.FormEvent<HTMLFormElement>) => void;
  onSaveDue: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const kinds = ["environment", "team", "service", "status"] as const;
  return (
    <div className="config-stack">
      <section className="panel config-panel">
        <PanelTitle
          title="Upcoming deployment urgency"
          subtitle="Set increasing day limits for each highlight colour."
        />
        <form className="due-config" onSubmit={onSaveDue}>
          <label>
            <i className="due-swatch red" />
            Red
            <input
              type="number"
              name="redDays"
              min="0"
              max="365"
              defaultValue={dueThresholds.red}
              required
            />
            <small>days</small>
          </label>
          <label>
            <i className="due-swatch yellow" />
            Yellow
            <input
              type="number"
              name="yellowDays"
              min="1"
              max="365"
              defaultValue={dueThresholds.yellow}
              required
            />
            <small>days</small>
          </label>
          <label>
            <i className="due-swatch gray" />
            Gray
            <input
              type="number"
              name="grayDays"
              min="1"
              max="365"
              defaultValue={dueThresholds.gray}
              required
            />
            <small>days</small>
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save urgency"}
          </button>
        </form>
        <p className="config-hint">
          Values must increase in order: Red &lt; Yellow &lt; Gray. Deployments
          beyond the gray limit use the normal style.
        </p>
      </section>
      <section className="panel config-panel">
        <PanelTitle
          title="Task dropdown values"
          subtitle="New active values appear in the task form immediately after saving."
        />
        <form className="config-add" onSubmit={onSave}>
          <label>
            Dropdown
            <select name="kind" required>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k[0].toUpperCase() + k.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            New value
            <input
              name="value"
              placeholder="Enter a new option"
              required
              maxLength={120}
            />
          </label>
          <button className="primary" disabled={busy}>
            <Plus /> {busy ? "Adding…" : "Add value"}
          </button>
        </form>
        <div className="config-grid">
          {kinds.map((kind) => (
            <article key={kind}>
              <h3>{kind}</h3>
              <div>
                {lookups
                  .filter((x) => x.kind === kind && x.active)
                  .map((x) => (
                    <span key={x.id}>{x.value}</span>
                  ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
