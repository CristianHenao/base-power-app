"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProfileOnboardingSettings } from "@/components/auth/profile-onboarding-settings";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type ProfileView = {
  email: string | null;
  fullName: string | null;
};

export function ProfileSettings() {
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;

      const user = data.user;
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: row } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;

      setProfile({
        email: row?.email ?? user.email ?? null,
        fullName:
          row?.full_name ??
          (typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : null),
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account and the home details from onboarding.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Details from your Base Power account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Full name</Label>
                <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  {profile?.fullName || "Not set"}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  {profile?.email || "Not set"}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ProfileOnboardingSettings />

      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <Link
          href="/risk"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Back to map
        </Link>
        <SignOutButton />
      </div>
    </div>
  );
}
