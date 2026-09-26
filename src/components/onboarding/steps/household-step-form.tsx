"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useOnboarding } from "@/components/providers/onboarding-provider";
import { HOME_TYPE_OPTIONS } from "@/lib/onboarding/constants";
import { createClient } from "@/lib/supabase/client";
import {
  getCurrentUser,
  saveOnboardingDraft,
} from "@/lib/supabase/profile";
import type { HomeType, HouseholdDetails } from "@/lib/types/domain";

type FormState = {
  homeType: HomeType | null;
  squareFootage: string;
  occupants: string;
  ownsHome: boolean;
  hasSolar: boolean;
  hasExistingBattery: boolean;
  averageMonthlyBillUsd: string;
};

function toFormState(household: Partial<HouseholdDetails>): FormState {
  return {
    homeType: household.homeType ?? null,
    squareFootage: household.squareFootage?.toString() ?? "",
    occupants: household.occupants?.toString() ?? "",
    ownsHome: household.ownsHome ?? true,
    hasSolar: household.hasSolar ?? false,
    hasExistingBattery: household.hasExistingBattery ?? false,
    averageMonthlyBillUsd: household.averageMonthlyBillUsd?.toString() ?? "",
  };
}

export function HouseholdStepForm() {
  const router = useRouter();
  const { draft, updateDraft } = useOnboarding();
  const [form, setForm] = useState<FormState>(() => toFormState(draft.household));
  const [seedKey, setSeedKey] = useState(() => JSON.stringify(draft.household));

  const nextSeedKey = JSON.stringify(draft.household);
  if (nextSeedKey !== seedKey) {
    setSeedKey(nextSeedKey);
    setForm(toFormState(draft.household));
  }

  function onContinue(event: React.FormEvent) {
    event.preventDefault();
    void (async () => {
      const next = updateDraft({
        household: {
          homeType: form.homeType,
          squareFootage: form.squareFootage ? Number(form.squareFootage) : null,
          occupants: form.occupants ? Number(form.occupants) : null,
          ownsHome: form.ownsHome,
          hasSolar: form.hasSolar,
          hasExistingBattery: form.hasExistingBattery,
          averageMonthlyBillUsd: form.averageMonthlyBillUsd
            ? Number(form.averageMonthlyBillUsd)
            : null,
        },
      });

      try {
        const supabase = createClient();
        const user = await getCurrentUser(supabase);
        if (user) {
          await saveOnboardingDraft(supabase, user.id, next);
        }
      } catch {
        // Keep going with local draft if sync fails.
      }

      router.push("/onboarding/goals");
    })();
  }

  return (
    <form onSubmit={onContinue} className="space-y-6">
      <fieldset className="space-y-3">
        <Legend>Home type</Legend>
        <RadioGroup
          value={form.homeType ?? ""}
          onValueChange={(value) =>
            setForm((prev) => ({
              ...prev,
              homeType: (value || null) as HomeType | null,
            }))
          }
          className="grid gap-2 sm:grid-cols-2"
        >
          {HOME_TYPE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 has-data-checked:border-primary has-data-checked:bg-primary/5"
            >
              <RadioGroupItem value={option.value} />
              <span className="text-sm">{option.label}</span>
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="squareFootage">Approx. square footage</Label>
          <Input
            id="squareFootage"
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="1800"
            value={form.squareFootage}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, squareFootage: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="occupants">People in household</Label>
          <Input
            id="occupants"
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="3"
            value={form.occupants}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, occupants: e.target.value }))
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bill">Average monthly electric bill (USD)</Label>
        <Input
          id="bill"
          type="number"
          min={0}
          inputMode="decimal"
          placeholder="150"
          value={form.averageMonthlyBillUsd}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              averageMonthlyBillUsd: e.target.value,
            }))
          }
        />
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <ToggleRow
          id="ownsHome"
          label="I own this home"
          checked={form.ownsHome}
          onCheckedChange={(checked) =>
            setForm((prev) => ({ ...prev, ownsHome: checked }))
          }
        />
        <ToggleRow
          id="hasSolar"
          label="I already have solar"
          checked={form.hasSolar}
          onCheckedChange={(checked) =>
            setForm((prev) => ({ ...prev, hasSolar: checked }))
          }
        />
        <ToggleRow
          id="hasExistingBattery"
          label="I already have a home battery"
          checked={form.hasExistingBattery}
          onCheckedChange={(checked) =>
            setForm((prev) => ({ ...prev, hasExistingBattery: checked }))
          }
        />
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/onboarding/address")}
        >
          Back
        </Button>
        <Button type="submit" disabled={!form.homeType}>
          Continue
        </Button>
      </div>
    </form>
  );
}

function Legend({ children }: { children: React.ReactNode }) {
  return (
    <legend className="text-sm font-medium text-foreground">{children}</legend>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}
