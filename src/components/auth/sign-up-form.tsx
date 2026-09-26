"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function SignUpForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/onboarding/address`,
        },
      });

      if (otpError) {
        setError(otpError.message);
        setSubmitting(false);
        return;
      }

      setSent(true);
      setSubmitting(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to send a magic link.",
      );
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <div className="space-y-2">
          <p className="font-medium">Check your email</p>
          <p className="text-sm text-muted-foreground">
            We sent a magic link to <strong>{email}</strong>. Open it on this
            device to create your account and continue onboarding.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => {
            setSent(false);
            setError(null);
          }}
        >
          Edit details
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          required
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Sending link…" : "Email me a magic link"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/"
          className={cn(buttonVariants({ variant: "link" }), "h-auto p-0")}
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
