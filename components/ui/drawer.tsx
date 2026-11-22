"use client";

import { DialogBase, type DialogBaseProps } from "@/components/ui/dialog-base";

/** Panel lateral derecho. Pensado para detalle secundario en tablet/desktop. */
export function Drawer(props: DialogBaseProps) {
  return <DialogBase {...props} placement="right" />;
}
