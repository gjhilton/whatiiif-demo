import { useEffect, useState } from 'react';

/** A labelled value, such as an address, to select or copy with one press. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard needs a secure context; the value stays selectable in the field.
    }
  };

  return (
    <label className="copy-field">
      <span>{label}</span>
      <span className="copy-row">
        <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" onClick={copy} aria-live="polite">{copied ? 'Copied' : 'Copy'}</button>
      </span>
    </label>
  );
}
