import type { BackupGoal, HomeType, LeadStatus } from "@/lib/types/domain";

export const HOME_TYPE_OPTIONS: { value: HomeType; label: string }[] = [
  { value: "single_family", label: "Single-family home" },
  { value: "townhouse", label: "Townhouse" },
  { value: "condo", label: "Condo" },
  { value: "apartment", label: "Apartment" },
  { value: "mobile", label: "Mobile / manufactured" },
  { value: "other", label: "Other" },
];

export const BACKUP_GOAL_OPTIONS: {
  value: BackupGoal;
  label: string;
  description: string;
}[] = [
  {
    value: "outage_resilience",
    label: "Outage resilience",
    description: "Stay powered through storms and grid failures.",
  },
  {
    value: "bill_savings",
    label: "Lower energy bills",
    description: "Shift usage and reduce peak-rate costs.",
  },
  {
    value: "ev_charging",
    label: "EV-ready backup",
    description: "Keep charging available when the grid is down.",
  },
  {
    value: "whole_home_backup",
    label: "Whole-home backup",
    description: "Cover as much of the home as possible.",
  },
  {
    value: "essentials_only",
    label: "Essentials only",
    description: "Focus on fridge, lights, internet, and medical needs.",
  },
  {
    value: "explore_options",
    label: "Still exploring",
    description: "Not sure yet — help me understand options.",
  },
];

export const LEAD_STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "proposal", label: "Proposal" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
] as const;
