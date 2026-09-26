import { CrmShell } from "@/components/layout/crm-shell";

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return <CrmShell>{children}</CrmShell>;
}
