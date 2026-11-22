"use client";

import { useId } from "react";

/** RPE 1–10 en botones grandes; tocar el elegido lo quita (es opcional). */
export function RpePicker({ legend, value, onChange, error }: { legend: string; value: string; onChange: (v: string) => void; error?: string }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink">
        {legend} <span className="font-normal text-muted">(opcional)</span>
      </legend>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((v) => (
          <label key={v} className="relative">
            <input
              type="radio"
              name={name}
              value={v}
              checked={value === v}
              onChange={() => onChange(v)}
              onClick={() => value === v && onChange("")}
              className="peer sr-only"
              aria-label={`RPE ${v}`}
            />
            <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface-2 font-semibold tabular-nums text-ink peer-checked:border-electric peer-checked:bg-electric/15 peer-focus-visible:outline-2 peer-focus-visible:outline-electric">
              {v}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
