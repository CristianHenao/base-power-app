"use client";

import { X } from "lucide-react";
import { frostControlClassName } from "@/components/risk/frost-panel";
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
    <button
      type="button"
      onClick={onClose}
      aria-label="Close analysis"
      className={cn(
        "pointer-events-auto inline-flex size-10 items-center justify-center rounded-full transition-colors",
        frostControlClassName,
        className,
      )}
    >
      <X className="size-5" aria-hidden />
    </button>
  );
}
