"use client";

import OnboardingWizard from "@/features/onboarding/onboarding-wizard";

import type {
  OnboardingDraftData,
} from "@/features/onboarding/schema";

/* =========================================================
   TYPES
========================================================= */

export type ProfileOnboardingProps = {
  userId: string;

  initialStep?:
    number;

  initialData?:
    OnboardingDraftData;
};

/* =========================================================
   PROFILE ONBOARDING

   This component intentionally delegates to the canonical
   onboarding wizard instead of duplicating onboarding state,
   validation, localStorage and autosave logic.
========================================================= */

export default function ProfileOnboarding({
  userId,
  initialStep = 0,
  initialData,
}: ProfileOnboardingProps) {
  return (
    <OnboardingWizard
      userId={
        userId
      }
      initialStep={
        initialStep
      }
      initialData={
        initialData
      }
    />
  );
}