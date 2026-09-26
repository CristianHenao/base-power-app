"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOnboarding } from "@/components/providers/onboarding-provider";
import { geocodeAddress } from "@/lib/map/geocode";
import { US_STATES } from "@/lib/onboarding/constants";
import type { Address } from "@/lib/types/domain";

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

export function AddressStepForm() {
  const router = useRouter();
  const { draft, updateDraft } = useOnboarding();
  const [address, setAddress] = useState<Address>(() =>
    toFormAddress(draft.address),
  );
  const [seedKey, setSeedKey] = useState(() => JSON.stringify(draft.address));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextSeedKey = JSON.stringify(draft.address);
  if (nextSeedKey !== seedKey) {
    setSeedKey(nextSeedKey);
    setAddress(toFormAddress(draft.address));
  }

  function update<K extends keyof Address>(key: K, value: Address[K]) {
    setAddress((prev) => ({ ...prev, [key]: value }));
  }

  async function onContinue(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const location = await geocodeAddress(address);
      if (!location) {
        setError(
          "We couldn’t find that address. Check the street, city, and ZIP, then try again.",
        );
        setSubmitting(false);
        return;
      }

      updateDraft({
        address: {
          ...address,
          latitude: location.latitude,
          longitude: location.longitude,
        },
      });
      router.push("/onboarding/household");
    } catch {
      setError(
        "Something went wrong looking up your address. Check your Mapbox token and try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onContinue} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="line1">Street address</Label>
        <Input
          id="line1"
          required
          autoComplete="address-line1"
          placeholder="123 Main St"
          value={address.line1}
          onChange={(e) => update("line1", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="line2">Apt, suite, etc. (optional)</Label>
        <Input
          id="line2"
          autoComplete="address-line2"
          placeholder="Unit 2"
          value={address.line2 ?? ""}
          onChange={(e) => update("line2", e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            required
            autoComplete="address-level2"
            value={address.city}
            onChange={(e) => update("city", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="state">State</Label>
          <Select
            value={address.state}
            onValueChange={(value) => {
              if (typeof value === "string") update("state", value);
            }}
          >
            <SelectTrigger id="state" className="w-full">
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
          <Label htmlFor="postalCode">ZIP code</Label>
          <Input
            id="postalCode"
            required
            autoComplete="postal-code"
            inputMode="numeric"
            value={address.postalCode}
            onChange={(e) => update("postalCode", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="country">Country</Label>
          <Input id="country" value={address.country} disabled />
        </div>
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
          onClick={() => router.push("/sign-up")}
        >
          Back
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Finding home…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
