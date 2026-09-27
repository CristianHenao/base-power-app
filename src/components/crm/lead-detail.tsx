import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  BACKUP_GOAL_OPTIONS,
  HOME_TYPE_OPTIONS,
  LEAD_STATUS_OPTIONS,
} from "@/lib/onboarding/constants";
import type { Lead } from "@/lib/types/domain";
import { cn } from "@/lib/utils";

export function LeadDetail({ lead }: { lead: Lead }) {
  const statusLabel =
    LEAD_STATUS_OPTIONS.find((s) => s.value === lead.status)?.label ??
    lead.status;
  const homeType =
    HOME_TYPE_OPTIONS.find((h) => h.value === lead.household.homeType)?.label ??
    "—";
  const primaryGoal =
    BACKUP_GOAL_OPTIONS.find((g) => g.value === lead.goals.primaryGoal)
      ?.label ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {lead.fullName}
            </h1>
            <Badge variant="outline">{statusLabel}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {lead.email}
            {lead.phone ? ` · ${lead.phone}` : ""}
          </p>
        </div>
        <Link
          href="/crm/leads"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Back to leads
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Property</CardTitle>
            <CardDescription>Captured during onboarding</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              {lead.address.line1}
              {lead.address.line2 ? `, ${lead.address.line2}` : ""}
            </p>
            <p>
              {lead.address.city}, {lead.address.state} {lead.address.postalCode}
            </p>
            <Separator />
            <DetailRow label="Home type" value={homeType} />
            <DetailRow
              label="Sq ft"
              value={lead.household.squareFootage?.toLocaleString() ?? "—"}
            />
            <DetailRow
              label="Occupants"
              value={lead.household.occupants?.toString() ?? "—"}
            />
            <DetailRow
              label="Monthly bill"
              value={
                lead.household.averageMonthlyBillUsd != null
                  ? `$${lead.household.averageMonthlyBillUsd}`
                  : "—"
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Goals & outlook</CardTitle>
            <CardDescription>From outage planning</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DetailRow label="Primary goal" value={primaryGoal} />
            <DetailRow
              label="Outlook score"
              value={lead.riskScore?.toString() ?? "Pending"}
            />
            <DetailRow
              label="Solar"
              value={lead.household.hasSolar ? "Yes" : "No"}
            />
            <DetailRow
              label="Existing battery"
              value={lead.household.hasExistingBattery ? "Yes" : "No"}
            />
            {lead.goals.notes ? (
              <>
                <Separator />
                <p className="text-muted-foreground">{lead.goals.notes}</p>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
