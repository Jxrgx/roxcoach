"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { IconButton } from "@/components/ui/icon-button";

export type DialogPlacement = "center" | "right" | "bottom";

export interface DialogBaseProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Acciones fijas al pie (p. ej. botón principal). */
  footer?: ReactNode;
  className?: string;
}

const PLACEMENT: Record<DialogPlacement, string> = {
  center:
    "m-auto w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] rounded-2xl",
  right:
    "ml-auto mr-0 my-0 h-dvh max-h-dvh w-full max-w-md rounded-none sm:rounded-l-2xl",
  bottom:
    "mx-auto mb-0 mt-auto w-full max-w-xl max-h-[88dvh] rounded-t-2xl",
};

/**
 * Base común para Modal, Drawer y BottomSheet sobre <dialog> nativo:
 * bloqueo de foco, cierre con Escape y `aria-modal` sin dependencias.
 */
export function DialogBase({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  placement,
}: DialogBaseProps & { placement: DialogPlacement }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    // Con cacheComponents las rutas ocultas conservan estado (<Activity>):
    // al ocultarse, el efecto se limpia y el diálogo no debe quedar en top layer.
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
    };
  }, [open]);

  // Evita que el fondo haga scroll mientras el diálogo está abierto.
  useEffect(() => {
    if (!open) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Clic en el fondo (fuera del contenido) cierra.
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "flex-col overflow-hidden border border-line bg-surface p-0 text-ink shadow-overlay open:flex",
        PLACEMENT[placement],
        className,
      )}
    >
      {placement === "bottom" && (
        <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line" />
      )}
      <header className="flex shrink-0 items-start gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0 flex-1 pt-2">
          <h2 id={titleId} className="text-lg font-semibold leading-tight">
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-1 text-sm text-muted">
              {description}
            </p>
          )}
        </div>
        <IconButton label="Cerrar" icon={<X />} onClick={onClose} className="-mr-2" />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
      {footer && (
        <footer className="safe-bottom flex shrink-0 flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
          {footer}
        </footer>
      )}
    </dialog>
  );
}
