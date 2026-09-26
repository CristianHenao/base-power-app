"use client";

import { useState } from "react";
import { useOnboarding } from "@/components/providers/onboarding-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { geocodeAddressClient } from "@/lib/map/geocode-client";
import {
  BACKUP_GOAL_OPTIONS,
  HOME_TYPE_OPTIONS,
  US_STATES,
} from "@/lib/onboarding/constants";
import { createClient } from "@/lib/supabase/client";
import {
  getCurrentUser,
  saveOnboardingDraft,
} from "@/lib/supabase/profile";
import type {
  Address,
  BackupGoal,
  HomeType,
  HouseholdDetails,
  OnboardingGoals,
} from "@/lib/types/domain";
import { cn } from "@/lib/utils";

const emptyAddress: Address = {
  line1: "",
  line2: "",
  city: "",
  state: "TX",
  postalCode: "",
  country: "US",
};

function toFormAddress(partial: Partial<Address>): Address {
  return {
    ...emptyAddress,
    ...partial,
    line2: partial.line2 ?? "",
  };
}

type HouseholdForm = {
  homeType: HomeType | null;
  squareFootage: string;
  occupants: string;
  ownsHome: boolean;
  hasSolar: boolean;
  hasExistingBattery: boolean;
  averageMonthlyBillUsd: string;
};

function toHouseholdForm(household: Partial<HouseholdDetails>): HouseholdForm {
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

type GoalsForm = {
  primaryGoal: BackupGoal | null;
  secondaryGoals: BackupGoal[];
  notes: string;
};

function toGoalsForm(goals: Partial<OnboardingGoals>): GoalsForm {
  return {
    primaryGoal: goals.primaryGoal ?? null,
    secondaryGoals: goals.secondaryGoals ?? [],
    notes: goals.notes ?? "",
  };
}

async function persistDraft(
  updateDraft: ReturnType<typeof useOnboarding>["updateDraft"],
  patch: Parameters<ReturnType<typeof useOnboarding>["updateDraft"]>[0],
) {
  const next = updateDraft(patch);
  const supabase = createClient();
  const user = await getCurrentUser(supabase);
  if (user) {
    await saveOnboardingDraft(supabase, user.id, next);
  }
  return next;
}

export function ProfileOnboardingSettings() {
  const { draft, updateDraft } = useOnboarding();

  const [address, setAddress] = useState<Address>(() =>
    toFormAddress(draft.address),
  );
  const [addressSeed, setAddressSeed] = useState(() =>
    JSON.stringify(draft.address),
  );
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressMessage, setAddressMessage] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);

  const nextAddressSeed = JSON.stringify(draft.address);
  if (nextAddressSeed !== addressSeed) {
    setAddressSeed(nextAddressSeed);
    setAddress(toFormAddress(draft.address));
  }

  const [household, setHousehold] = useState<HouseholdForm>(() =>
    toHouseholdForm(draft.household),
  );
  const [householdSeed, setHouseholdSeed] = useState(() =>
    JSON.stringify(draft.household),
  );
  const [householdSaving, setHouseholdSaving] = useState(false);
  const [householdMessage, setHouseholdMessage] = useState<string | null>(null);

  const nextHouseholdSeed = JSON.stringify(draft.household);
  if (nextHouseholdSeed !== householdSeed) {
    setHouseholdSeed(nextHouseholdSeed);
    setHousehold(toHouseholdForm(draft.household));
  }

  const [goals, setGoals] = useState<GoalsForm>(() => toGoalsForm(draft.goals));
  const [goalsSeed, setGoalsSeed] = useState(() => JSON.stringify(draft.goals));
  const [goalsSaving, setGoalsSaving] = useState(false);
  const [goalsMessage, setGoalsMessage] = useState<string | null>(null);

  const nextGoalsSeed = JSON.stringify(draft.goals);
  if (nextGoalsSeed !== goalsSeed) {
    setGoalsSeed(nextGoalsSeed);
    setGoals(toGoalsForm(draft.goals));
  }

  async function saveAddress(event: React.FormEvent) {
    event.preventDefault();
    setAddressSaving(true);
    setAddressError(null);
    setAddressMessage(null);

    try {
      const location = await geocodeAddressClient(address);
      if (!location) {
        setAddressError(
          "We couldn’t find that address. Check the street, city, and ZIP.",
        );
        return;
      }

      await persistDraft(updateDraft, {
        address: {
          ...address,
          latitude: location.latitude,
          longitude: location.longitude,
        },
      });
      setAddressMessage("Home address saved.");
    } catch {
      setAddressError("Couldn’t save address. Try again.");
    } finally {
      setAddressSaving(false);
    }
  }

  async function saveHousehold(event: React.FormEvent) {
    event.preventDefault();
    setHouseholdSaving(true);
    setHouseholdMessage(null);
    try {
      await persistDraft(updateDraft, {
        household: {
          homeType: household.homeType,
          squareFootage: household.squareFootage
            ? Number(household.squareFootage)
            : null,
          occupants: household.occupants ? Number(household.occupants) : null,
          ownsHome: household.ownsHome,
          hasSolar: household.hasSolar,
          hasExistingBattery: household.hasExistingBattery,
          averageMonthlyBillUsd: household.averageMonthlyBillUsd
            ? Number(household.averageMonthlyBillUsd)
            : null,
        },
      });
      setHouseholdMessage("Household details saved.");
    } catch {
      setHouseholdMessage("Couldn’t save household details.");
    } finally {
      setHouseholdSaving(false);
    }
  }

  async function saveGoals(event: React.FormEvent) {
    event.preventDefault();
    setGoalsSaving(true);
    setGoalsMessage(null);
    try {
      await persistDraft(updateDraft, {
        goals: {
          primaryGoal: goals.primaryGoal,
          secondaryGoals: goals.secondaryGoals,
          notes: goals.notes,
        },
      });
      setGoalsMessage("Goals saved.");
    } catch {
      setGoalsMessage("Couldn’t save goals.");
    } finally {
      setGoalsSaving(false);
    }
  }

  function toggleSecondary(goal: BackupGoal) {
    setGoals((prev) => ({
      ...prev,
      secondaryGoals: prev.secondaryGoals.includes(goal)
        ? prev.secondaryGoals.filter((item) => item !== goal)
        : [...prev.secondaryGoals, goal],
    }));
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Your home</h2>
        <p className="text-sm text-muted-foreground">
          Update the details from onboarding. Changes sync to your profile and
          the risk map.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
          <CardDescription>
            Used to place your home on the risk map.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void saveAddress(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-line1">Street address</Label>
              <Input
                id="profile-line1"
                required
                autoComplete="address-line1"
                value={address.line1}
                onChange={(e) =>
                  setAddress((prev) => ({ ...prev, line1: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-line2">Apt, suite, etc. (optional)</Label>
              <Input
                id="profile-line2"
                autoComplete="address-line2"
                value={address.line2 ?? ""}
                onChange={(e) =>
                  setAddress((prev) => ({ ...prev, line2: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="profile-city">City</Label>
                <Input
                  id="profile-city"
                  required
                  autoComplete="address-level2"
                  value={address.city}
                  onChange={(e) =>
                    setAddress((prev) => ({ ...prev, city: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-state">State</Label>
                <Select
                  value={address.state}
                  onValueChange={(value) => {
                    if (typeof value === "string") {
                      setAddress((prev) => ({ ...prev, state: value }));
                    }
                  }}
                >
                  <SelectTrigger id="profile-state" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="profile-zip">ZIP code</Label>
                <Input
                  id="profile-zip"
                  required
                  autoComplete="postal-code"
                  inputMode="numeric"
                  value={address.postalCode}
                  onChange={(e) =>
                    setAddress((prev) => ({
                      ...prev,
                      postalCode: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-country">Country</Label>
                <Input id="profile-country" value={address.country} disabled />
              </div>
            </div>
            {addressError ? (
              <p className="text-sm text-destructive" role="alert">
                {addressError}
              </p>
            ) : null}
            {addressMessage ? (
              <p className="text-sm text-muted-foreground">{addressMessage}</p>
            ) : null}
            <Button type="submit" disabled={addressSaving}>
              {addressSaving ? "Saving…" : "Save address"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Household</CardTitle>
          <CardDescription>
            Home type, size, and energy setup for backup sizing estimates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void saveHousehold(e)} className="space-y-5">
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Home type</legend>
              <RadioGroup
                value={household.homeType ?? ""}
                onValueChange={(value) =>
                  setHousehold((prev) => ({
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
                <Label htmlFor="profile-sqft">Approx. square footage</Label>
                <Input
                  id="profile-sqft"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={household.squareFootage}
                  onChange={(e) =>
                    setHousehold((prev) => ({
                      ...prev,
                      squareFootage: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-occupants">People in household</Label>
                <Input
                  id="profile-occupants"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={household.occupants}
                  onChange={(e) =>
                    setHousehold((prev) => ({
                      ...prev,
                      occupants: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-bill">
                Average monthly electric bill (USD)
              </Label>
              <Input
                id="profile-bill"
                type="number"
                min={0}
                inputMode="decimal"
                value={household.averageMonthlyBillUsd}
                onChange={(e) =>
                  setHousehold((prev) => ({
                    ...prev,
                    averageMonthlyBillUsd: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <ToggleRow
                id="profile-owns"
                label="I own this home"
                checked={household.ownsHome}
                onCheckedChange={(checked) =>
                  setHousehold((prev) => ({ ...prev, ownsHome: checked }))
                }
              />
              <ToggleRow
                id="profile-solar"
                label="I already have solar"
                checked={household.hasSolar}
                onCheckedChange={(checked) =>
                  setHousehold((prev) => ({ ...prev, hasSolar: checked }))
                }
              />
              <ToggleRow
                id="profile-battery"
                label="I already have a home battery"
                checked={household.hasExistingBattery}
                onCheckedChange={(checked) =>
                  setHousehold((prev) => ({
                    ...prev,
                    hasExistingBattery: checked,
                  }))
                }
              />
            </div>

            {householdMessage ? (
              <p className="text-sm text-muted-foreground">{householdMessage}</p>
            ) : null}
            <Button
              type="submit"
              disabled={householdSaving || !household.homeType}
            >
              {householdSaving ? "Saving…" : "Save household"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Goals</CardTitle>
          <CardDescription>
            What you want from backup — used to tailor recommendations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void saveGoals(e)} className="space-y-5">
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Primary goal</legend>
              <RadioGroup
                value={goals.primaryGoal ?? ""}
                onValueChange={(value) =>
                  setGoals((prev) => ({
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
                      <span className="block text-sm font-medium">
                        {option.label}
                      </span>
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
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {BACKUP_GOAL_OPTIONS.filter(
                  (option) => option.value !== goals.primaryGoal,
                ).map((option) => {
                  const selected = goals.secondaryGoals.includes(option.value);
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
              <Label htmlFor="profile-notes">Anything we should know?</Label>
              <Textarea
                id="profile-notes"
                rows={4}
                placeholder="e.g. medical equipment, remote work, frequent outages…"
                value={goals.notes}
                onChange={(e) =>
                  setGoals((prev) => ({ ...prev, notes: e.target.value }))
                }
              />
            </div>

            {goalsMessage ? (
              <p className="text-sm text-muted-foreground">{goalsMessage}</p>
            ) : null}
            <Button type="submit" disabled={goalsSaving || !goals.primaryGoal}>
              {goalsSaving ? "Saving…" : "Save goals"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
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
