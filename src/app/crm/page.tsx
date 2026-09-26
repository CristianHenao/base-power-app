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
import { MOCK_LEADS } from "@/lib/crm/mock-leads";
import { cn } from "@/lib/utils";

export default function CrmOverviewPage() {
  const newCount = MOCK_LEADS.filter((l) => l.status === "new").length;
  const activeCount = MOCK_LEADS.filter((l) =>
    ["contacted", "qualified", "proposal"].includes(l.status),
  ).length;

  return (
    <main className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">CRM overview</h1>
        <p className="text-sm text-muted-foreground">
          Manage leads generated from homeowner risk analysis planning.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total leads</CardDescription>
            <CardTitle className="text-3xl">{MOCK_LEADS.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>New</CardDescription>
            <CardTitle className="text-3xl">{newCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary">Needs first contact</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>In pipeline</CardDescription>
            <CardTitle className="text-3xl">{activeCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lead inbox</CardTitle>
          <CardDescription>
            Jump into the full list to qualify homeowners from risk analysis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/crm/leads"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            View all leads
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
