import { OnboardingStepLayout } from "@/components/onboarding/onboarding-step-layout";
import { GoalsStepForm } from "@/components/onboarding/steps/goals-step-form";

export default function GoalsOnboardingPage() {
  return (
    <OnboardingStepLayout stepId="goals">
      <GoalsStepForm />
    </OnboardingStepLayout>
  );
}
