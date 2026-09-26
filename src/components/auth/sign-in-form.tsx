"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function SignInForm() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/risk";
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
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(nextPath)}`,
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
            device to finish signing in.
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
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
        New here?{" "}
        <Link
          href="/sign-up"
          className={cn(buttonVariants({ variant: "link" }), "h-auto p-0")}
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
