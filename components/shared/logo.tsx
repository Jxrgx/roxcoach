import { cn } from "@/lib/utils/cn";

/** Marca tipográfica de RoxCoach. */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-bold tracking-tight text-ink", className)}>
      <svg aria-hidden viewBox="0 0 32 32" className="size-7 shrink-0">
        <rect width="32" height="32" rx="8" className="fill-surface-2" />
        <path d="M9 23V9h7.5a4.5 4.5 0 0 1 1.2 8.84L22.5 23h-4.2l-4.1-4.8H12.6V23H9Zm3.6-8h3.7a1.5 1.5 0 0 0 0-3h-3.7v3Z" className="fill-acid" />
      </svg>
      {!compact && (
        <span className="text-lg">
          Rox<span className="text-acid">Coach</span>
        </span>
      )}
      {compact && <span className="sr-only">RoxCoach</span>}
    </span>
  );
}
