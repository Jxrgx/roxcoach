"use client";

import { DialogBase, type DialogBaseProps } from "@/components/ui/dialog-base";

/** Diálogo centrado. Para decisiones o formularios cortos. */
export function Modal(props: DialogBaseProps) {
  return <DialogBase {...props} placement="center" />;
}
