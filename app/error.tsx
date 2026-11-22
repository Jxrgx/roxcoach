"use client";

import { RouteError } from "@/components/shared/route-error";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <RouteError error={error} retry={retry} homeHref="/" />
    </main>
  );
}
