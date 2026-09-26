/** Shared domain types for consumer onboarding and CRM leads. */

export type HomeType =
  | "single_family"
  | "townhouse"
  | "condo"
  | "apartment"
  | "mobile"
  | "other";

export type BackupGoal =
  | "outage_resilience"
  | "bill_savings"
  | "ev_charging"
  | "whole_home_backup"
  | "essentials_only"
  | "explore_options";

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "won"
  | "lost";

export type Address = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  /** Optional geocode for risk / map analysis */
  latitude?: number;
  longitude?: number;
};

export type HouseholdDetails = {
  homeType: HomeType | null;
  squareFootage: number | null;
  occupants: number | null;
  ownsHome: boolean | null;
  hasSolar: boolean | null;
  hasExistingBattery: boolean | null;
  averageMonthlyBillUsd: number | null;
};

export type OnboardingGoals = {
  primaryGoal: BackupGoal | null;
  secondaryGoals: BackupGoal[];
  notes: string;
};

export type OnboardingDraft = {
  address: Partial<Address>;
  household: Partial<HouseholdDetails>;
  goals: Partial<OnboardingGoals>;
};

export type ConsumerProfile = {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  address: Address;
  household: HouseholdDetails;
  goals: OnboardingGoals;
  onboardingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Lead = {
  id: string;
  consumerId: string;
  status: LeadStatus;
  source: "risk_analysis";
  /** Snapshot captured when the lead entered the CRM */
  fullName: string;
  email: string;
  phone?: string;
  address: Address;
  household: HouseholdDetails;
  goals: OnboardingGoals;
  riskScore?: number | null;
  assignedTo?: string | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type CrmUser = {
  id: string;
  email: string;
  fullName: string;
  role: "agent" | "manager" | "admin";
};
