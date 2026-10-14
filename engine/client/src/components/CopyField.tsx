import { useState } from 'react';

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard needs a secure context; the value stays selectable in the field.
    }
  };

  return (
    <label className="copy-field">
      <span>{label}</span>
      <span className="copy-row">
        <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </span>
    </label>
  );
}
