export const ONBOARDING_STEPS = [
  {
    id: "address",
    title: "Home address",
    description: "Where should we look up outages?",
    href: "/onboarding/address",
  },
  {
    id: "household",
    title: "Household",
    description: "A few details about your home and energy setup.",
    href: "/onboarding/household",
  },
  {
    id: "goals",
    title: "Backup goals",
    description: "What you want backup batteries to solve.",
    href: "/onboarding/goals",
  },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]["id"];

export function getStepIndex(stepId: OnboardingStepId): number {
  return ONBOARDING_STEPS.findIndex((step) => step.id === stepId);
}

export function getStepProgress(stepId: OnboardingStepId): number {
  const index = getStepIndex(stepId);
  if (index < 0) return 0;
  return Math.round(((index + 1) / ONBOARDING_STEPS.length) * 100);
}
