import { LoadingState, Skeleton } from "@/components/ui/loading-state";

export default function AthleteLoading() {
  return (
    <div>
      <Skeleton className="mb-2 h-8 w-48" />
      <Skeleton className="mb-6 h-4 w-72 max-w-full" />
      <LoadingState label="Cargando…" rows={4} />
    </div>
  );
}
