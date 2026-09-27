"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useOnboarding } from "@/components/providers/onboarding-provider";
import { BACKUP_GOAL_OPTIONS } from "@/lib/onboarding/constants";
import { POST_ONBOARDING_PATH } from "@/lib/onboarding/profile-sync";
import { createClient } from "@/lib/supabase/client";
import {
  completeOnboarding,
  getCurrentUser,
} from "@/lib/supabase/profile";
import type { BackupGoal, OnboardingGoals } from "@/lib/types/domain";
import { cn } from "@/lib/utils";

type GoalsFormState = {
  primaryGoal: BackupGoal | null;
  secondaryGoals: BackupGoal[];
  notes: string;
};

function toFormState(goals: Partial<OnboardingGoals>): GoalsFormState {
  return {
    primaryGoal: goals.primaryGoal ?? null,
    secondaryGoals: goals.secondaryGoals ?? [],
    notes: goals.notes ?? "",
  };
}

export function GoalsStepForm() {
  const router = useRouter();
  const { draft, updateDraft } = useOnboarding();
  const [form, setForm] = useState<GoalsFormState>(() =>
    toFormState(draft.goals),
  );
  const [seedKey, setSeedKey] = useState(() => JSON.stringify(draft.goals));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextSeedKey = JSON.stringify(draft.goals);
  if (nextSeedKey !== seedKey) {
    setSeedKey(nextSeedKey);
    setForm(toFormState(draft.goals));
  }

  function toggleSecondary(goal: BackupGoal) {
    setForm((prev) => ({
      ...prev,
      secondaryGoals: prev.secondaryGoals.includes(goal)
        ? prev.secondaryGoals.filter((g) => g !== goal)
        : [...prev.secondaryGoals, goal],
    }));
  }

  function onFinish(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    void (async () => {
      const next = updateDraft({
        goals: {
          primaryGoal: form.primaryGoal,
          secondaryGoals: form.secondaryGoals,
          notes: form.notes,
        },
      });

      try {
        const supabase = createClient();
        const user = await getCurrentUser(supabase);
        if (!user) {
          throw new Error("Your session ended. Sign in again to finish.");
        }
        await completeOnboarding(supabase, user.id, next);
      } catch (err) {
        // The map guard needs onboarding_completed_at, so stay here until it is saved.
        setError(
          err instanceof Error ? err.message : "We couldn't save your answers. Try again.",
        );
        setSubmitting(false);
        return;
      }

      // A map prefetch from before onboarding finished can hold the proxy's
      // redirect back to step 1; refresh clears the router cache first.
      router.refresh();
      router.push(POST_ONBOARDING_PATH);
    })();
  }

  return (
    <form onSubmit={onFinish} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Primary goal</legend>
        <RadioGroup
          value={form.primaryGoal ?? ""}
          onValueChange={(value) =>
            setForm((prev) => ({
              ...prev,
              primaryGoal: (value || null) as BackupGoal | null,
            }))
          }
          className="grid gap-2"
        >
          {BACKUP_GOAL_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer gap-3 rounded-lg border px-3 py-3 has-data-checked:border-primary has-data-checked:bg-primary/5"
            >
              <RadioGroupItem value={option.value} className="mt-0.5" />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">
          Anything else that matters?{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {BACKUP_GOAL_OPTIONS.filter(
            (o) => o.value !== form.primaryGoal,
          ).map((option) => {
            const selected = form.secondaryGoals.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleSecondary(option.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-colors",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="notes">Anything we should know?</Label>
        <Textarea
          id="notes"
          rows={4}
          placeholder="e.g. medical equipment, remote work, frequent outages…"
          value={form.notes}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, notes: e.target.value }))
          }
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/onboarding/household")}
        >
          Back
        </Button>
        <Button type="submit" disabled={!form.primaryGoal || submitting}>
          {submitting ? "Saving…" : "Finish & see outage outlook"}
        </Button>
      </div>
    </form>
  );
}
