import { notFound } from "next/navigation";
import { LeadDetail } from "@/components/crm/lead-detail";
import { getLeadById } from "@/lib/crm/mock-leads";

export default async function CrmLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = getLeadById(id);
  if (!lead) notFound();

  return (
    <main>
      <LeadDetail lead={lead} />
    </main>
  );
}
