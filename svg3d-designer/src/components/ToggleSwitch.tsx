/** A real switch — pill track + sliding thumb — not just a button that
 * changes color when active. */
export function ToggleSwitch({
  label,
  checked,
  onChange,
  title,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  title?: string;
}) {
  return (
    <label className="toggle-switch" title={title}>
      <span className="toggle-switch-label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={"toggle-switch-track" + (checked ? " on" : "")}
        onClick={onChange}
      >
        <span className="toggle-switch-thumb" />
      </button>
    </label>
  );
}
