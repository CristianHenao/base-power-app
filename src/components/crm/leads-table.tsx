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
import { LEAD_STATUS_OPTIONS } from "@/lib/onboarding/constants";
import type { Lead } from "@/lib/types/domain";
import { cn } from "@/lib/utils";

export function LeadsTable({ leads }: { leads: Lead[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Leads from outage planning</CardTitle>
        <CardDescription>
          Homeowners who completed planning become CRM leads for your team.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-y bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Lead</th>
              <th className="px-4 py-2.5 font-medium">Location</th>
              <th className="px-4 py-2.5 font-medium">Goal</th>
              <th className="px-4 py-2.5 font-medium">Outlook</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{lead.fullName}</div>
                  <div className="text-xs text-muted-foreground">{lead.email}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {lead.address.city}, {lead.address.state}
                </td>
                <td className="px-4 py-3 capitalize text-muted-foreground">
                  {lead.goals.primaryGoal?.replaceAll("_", " ") ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {lead.riskScore != null ? (
                    <Badge variant="secondary">{lead.riskScore}</Badge>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline">
                    {LEAD_STATUS_OPTIONS.find((s) => s.value === lead.status)
                      ?.label ?? lead.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/crm/leads/${lead.id}`}
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "sm" }),
                    )}
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
