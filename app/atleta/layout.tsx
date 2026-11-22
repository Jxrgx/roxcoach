import type { Metadata } from "next";
import { Suspense } from "react";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { AreaSkeleton, AthleteGate } from "@/components/shared/area-gate";

export const metadata: Metadata = {
  title: { default: "App del atleta", template: "%s · RoxCoach" },
};

export default function AthleteLayout({ children }: LayoutProps<"/atleta">) {
  return (
    <AthleteShell>
      <Suspense fallback={<AreaSkeleton />}>
        <AthleteGate>{children}</AthleteGate>
      </Suspense>
    </AthleteShell>
  );
}
