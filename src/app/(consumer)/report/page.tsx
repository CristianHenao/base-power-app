import type { Metadata } from "next";
import { ReportPage } from "@/components/report/report-page";

export const metadata: Metadata = {
  title: "Will my lights stay on? | Porchlight",
};

export default function Page() {
  return <ReportPage />;
}
