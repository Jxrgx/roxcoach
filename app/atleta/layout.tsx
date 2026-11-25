import type { Metadata } from "next";
import { Suspense } from "react";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { AreaSkeleton, AthleteGate } from "@/components/shared/area-gate";
import { AthleteMessagesHeaderLink, MessagesHeaderLink } from "@/components/athlete/messages-indicator";

export const metadata: Metadata = {
  title: { default: "App del atleta", template: "%s · RoxCoach" },
};

export default function AthleteLayout({ children }: LayoutProps<"/atleta">) {
  return (
    <AthleteShell
      headerAction={
        <Suspense fallback={<MessagesHeaderLink count={null} />}>
          <AthleteMessagesHeaderLink />
        </Suspense>
      }
    >
      <Suspense fallback={<AreaSkeleton />}>
        <AthleteGate>{children}</AthleteGate>
      </Suspense>
    </AthleteShell>
  );
}
