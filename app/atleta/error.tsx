"use client";

import { RouteError } from "@/components/shared/route-error";

export default function AthleteError({ error, retry }: { error: unknown; retry: () => void }) {
  return <RouteError error={error} retry={retry} homeHref="/atleta/inicio" />;
}
