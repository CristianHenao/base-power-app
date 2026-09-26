import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import {
  ONBOARDING_STEPS,
  getStepProgress,
  type OnboardingStepId,
} from "@/lib/onboarding/steps";
import { cn } from "@/lib/utils";

export function OnboardingProgress({ stepId }: { stepId: OnboardingStepId }) {
  const currentIndex = ONBOARDING_STEPS.findIndex((s) => s.id === stepId);
  const progress = getStepProgress(stepId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">
          Step {currentIndex + 1} of {ONBOARDING_STEPS.length}
        </p>
        <p className="font-medium">{progress}%</p>
      </div>
      <Progress value={progress} />
      <ol className="grid grid-cols-3 gap-2">
        {ONBOARDING_STEPS.map((step, index) => {
          const state =
            index < currentIndex
              ? "done"
              : index === currentIndex
                ? "current"
                : "upcoming";
          return (
            <li key={step.id}>
              <Link
                href={step.href}
                className={cn(
                  "block rounded-lg border px-2.5 py-2 text-left transition-colors",
                  state === "current" && "border-primary bg-primary/5",
                  state === "done" && "border-border bg-muted/40",
                  state === "upcoming" && "border-dashed text-muted-foreground",
                )}
              >
                <p className="text-xs font-medium">{step.title}</p>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
