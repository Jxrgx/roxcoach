import { LoadingState, Skeleton } from "@/components/ui/loading-state";

export default function CoachLoading() {
  return (
    <div>
      <Skeleton className="mb-2 h-8 w-48" />
      <Skeleton className="mb-6 h-4 w-72 max-w-full" />
      <LoadingState label="Cargando panel…" rows={4} />
    </div>
  );
}
