import { OnboardingStepLayout } from "@/components/onboarding/onboarding-step-layout";
import { AddressStepForm } from "@/components/onboarding/steps/address-step-form";

export default function AddressOnboardingPage() {
  return (
    <OnboardingStepLayout stepId="address">
      <AddressStepForm />
    </OnboardingStepLayout>
  );
}
