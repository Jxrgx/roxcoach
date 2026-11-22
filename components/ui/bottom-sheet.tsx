"use client";

import { DialogBase, type DialogBaseProps } from "@/components/ui/dialog-base";

/**
 * Panel inferior para mobile: opciones secundarias al alcance del pulgar
 * (ver video, instrucciones, sustituir ejercicio, más secciones).
 */
export function BottomSheet(props: DialogBaseProps) {
  return <DialogBase {...props} placement="bottom" />;
}
