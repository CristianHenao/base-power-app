import type { ReactNode } from "react";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import type { OnboardingStepId } from "@/lib/onboarding/steps";
import { ONBOARDING_STEPS } from "@/lib/onboarding/steps";

export function OnboardingStepLayout({
  stepId,
  children,
}: {
  stepId: OnboardingStepId;
  children: ReactNode;
}) {
  const step = ONBOARDING_STEPS.find((s) => s.id === stepId);

  return (
    <div className="flex flex-1 flex-col gap-8">
      <OnboardingProgress stepId={stepId} />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{step?.title}</h1>
        <p className="text-sm text-muted-foreground">{step?.description}</p>
      </div>
      {children}
    </div>
  );
}
