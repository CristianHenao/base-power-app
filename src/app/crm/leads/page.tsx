import { LeadsTable } from "@/components/crm/leads-table";
import { MOCK_LEADS } from "@/lib/crm/mock-leads";

export default function CrmLeadsPage() {
  return (
    <main className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Homeowners who completed onboarding and risk analysis planning.
        </p>
      </div>
      <LeadsTable leads={MOCK_LEADS} />
    </main>
  );
}
