import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-flex size-7 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
              BP
            </span>
            Base Power
          </Link>
          <Badge variant="secondary">PWA scaffold</Badge>
        </div>
      </header>
      <Separator />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6">
        {children}
      </div>
    </div>
  );
}
