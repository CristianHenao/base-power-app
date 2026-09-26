import { ConsumerShell } from "@/components/layout/consumer-shell";

export default function ConsumerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConsumerShell>{children}</ConsumerShell>;
}
