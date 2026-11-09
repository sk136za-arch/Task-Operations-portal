import type React from "react";

export function Modal({
  title,
  close,
  back,
  children,
}: {
  title: string;
  close: () => void;
  back?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="drawer-backdrop" onClick={close}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        {back && (
          <button className="modal-back" onClick={back}>
            ← Back
          </button>
        )}
        <button className="close" onClick={close}>
          ×
        </button>
        <h2>{title}</h2>
        {children}
      </aside>
    </div>
  );
}
export function Field({
  name,
  label,
  value,
  disabled = false,
}: {
  name: string;
  label: string;
  value: string;
  disabled?: boolean;
}) {
  return (
    <label>
      {label}
      <input name={name} defaultValue={value} readOnly={disabled} required />
    </label>
  );
}
export function SelectField({
  name,
  label,
  value,
  values,
}: {
  name: string;
  label: string;
  value: string;
  values: string[];
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value} required>
        <option value="" disabled>
          Select…
        </option>
        {values.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
}
