import { initials } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

/** Avatar con iniciales (sin fotos en esta fase). */
export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 font-semibold text-ink",
        size === "sm" ? "size-9 text-xs" : "size-11 text-sm",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
