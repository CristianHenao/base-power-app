import type { Metadata } from "next";
import { EmbedReport } from "@/components/report/embed-report";
import type { Heat } from "@/lib/report/types";

export const metadata: Metadata = {
  title: "Will my lights stay on?",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ zip?: string; heat?: string }>;
}) {
  const params = await searchParams;
  const zip = (params.zip ?? "").slice(0, 5);
  const heat: Heat = params.heat === "electric" ? "electric" : "gas";
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <EmbedReport zip={zip} heat={heat} />
    </main>
  );
}
