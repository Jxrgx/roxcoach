"use client";

import { useState, type ReactNode } from "react";
import { Hammer } from "lucide-react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

interface ComingSoonButtonProps {
  children: ReactNode;
  icon?: ReactNode;
  /** Nombre del módulo que implementará esta acción. */
  module: string;
  description: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/**
 * Acción principal de una pantalla cuyo flujo aún no se implementa.
 * Evita botones muertos: explica qué hará y en qué módulo llegará.
 */
export function ComingSoonButton({ children, icon, module, description, variant = "primary", size, fullWidth, className }: ComingSoonButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} icon={icon} onClick={() => setOpen(true)} fullWidth={fullWidth} className={className} aria-haspopup="dialog">
        {children}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={typeof children === "string" ? children : module}
        footer={
          <Button variant="secondary" onClick={() => setOpen(false)} fullWidth className="sm:w-auto">
            Entendido
          </Button>
        }
      >
        <div className="flex gap-3">
          <Hammer aria-hidden className="mt-0.5 size-5 shrink-0 text-electric" />
          <div>
            <p className="text-ink">{description}</p>
            <p className="mt-2 text-sm text-muted">Disponible con el módulo de {module}.</p>
          </div>
        </div>
      </Modal>
    </>
  );
}
