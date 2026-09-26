import Link from "next/link";
import { cn } from "@/lib/utils";

/** Header link to the outage report, shown beside the avatar on every consumer screen. */
export function ReportNavLink({ active = false }: { active?: boolean }) {
  return (
    <Link
      href="/report"
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "border-foreground bg-foreground text-background" : "border-border bg-white hover:bg-muted",
      )}
    >
      <span className="sm:hidden">Report</span>
      <span className="hidden sm:inline">Will my lights stay on?</span>
    </Link>
  );
}
