import { OnboardingStepLayout } from "@/components/onboarding/onboarding-step-layout";
import { HouseholdStepForm } from "@/components/onboarding/steps/household-step-form";

export default function HouseholdOnboardingPage() {
  return (
    <OnboardingStepLayout stepId="household">
      <HouseholdStepForm />
    </OnboardingStepLayout>
  );
}
