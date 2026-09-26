"use client";

import { X } from "lucide-react";
import { FrostControl } from "@/components/risk/frost-panel";
import { cn } from "@/lib/utils";

type AnalysisCloseButtonProps = {
  onClose: () => void;
  className?: string;
};

export function AnalysisCloseButton({
  onClose,
  className,
}: AnalysisCloseButtonProps) {
  return (
    <FrostControl
      onClick={onClose}
      aria-label="Close analysis"
      className={cn("pointer-events-auto", className)}
    >
      <X className="size-5" aria-hidden />
    </FrostControl>
  );
}
