"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { ensureProfile } from "@/lib/supabase/profile";
import { cn } from "@/lib/utils";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/risk";
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
        },
      });

      if (otpError) {
        setError(otpError.message);
        setSubmitting(false);
        return;
      }

      setSent(true);
      setToken("");
      setSubmitting(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to send a sign-in code.",
      );
      setSubmitting(false);
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: token.trim(),
        type: "email",
      });

      if (verifyError) {
        setError(verifyError.message);
        setSubmitting(false);
        return;
      }

      if (data.user) {
        try {
          await ensureProfile(supabase, data.user);
        } catch {
          // Profile trigger may have already created the row.
        }
      }

      const destination = nextPath.startsWith("/") ? nextPath : "/risk";
      router.push(destination);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to verify that code.",
      );
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <form onSubmit={verifyCode} className="space-y-4">
        <div className="space-y-2 text-center">
          <p className="font-medium">Enter your code</p>
          <p className="text-sm text-muted-foreground">
            We sent a one-time code to <strong>{email}</strong>.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="token">One-time code</Label>
          <Input
            id="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            minLength={6}
            maxLength={8}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="123456"
          />
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Verifying…" : "Verify and sign in"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={submitting}
          onClick={() => {
            setSent(false);
            setToken("");
            setError(null);
          }}
        >
          Use a different email
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} className="space-y-4">
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
        {submitting ? "Sending code…" : "Email me a code"}
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
