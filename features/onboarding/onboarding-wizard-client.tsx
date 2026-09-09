"use client";

import OnboardingWizard, {
  type OnboardingWizardProps,
} from "@/features/onboarding/onboarding-wizard";

/* =========================================================
   CLIENT WRAPPER

   Hydration handling is now implemented by OnboardingWizard
   itself using useSyncExternalStore.

   No setMounted(true) effect is required.
========================================================= */

export default function OnboardingWizardClient(
  props:
    OnboardingWizardProps,
) {
  return (
    <OnboardingWizard
      {...props}
    />
  );
}