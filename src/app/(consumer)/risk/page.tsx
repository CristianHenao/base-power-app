import { redirect } from "next/navigation";
import { POST_ONBOARDING_PATH } from "@/lib/onboarding/profile-sync";

/** Older links used /risk. The screen lives at /outlook. */
export default function RiskRedirectPage() {
  redirect(POST_ONBOARDING_PATH);
}
