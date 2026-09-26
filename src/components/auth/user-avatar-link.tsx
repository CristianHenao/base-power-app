"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function initialsFrom(
  fullName: string | null | undefined,
  email: string | null | undefined,
) {
  const name = fullName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
    return `${first}${last}`.toUpperCase() || "?";
  }
  return email?.trim()?.[0]?.toUpperCase() ?? "?";
}

type UserAvatarLinkProps = {
  className?: string;
};

export function UserAvatarLink({ className }: UserAvatarLinkProps) {
  const [initials, setInitials] = useState("?");

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const user = data.user;
      const fullName =
        typeof user?.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : null;
      setInitials(initialsFrom(fullName, user?.email));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link
      href="/profile"
      aria-label="Profile settings"
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      {initials}
    </Link>
  );
}
