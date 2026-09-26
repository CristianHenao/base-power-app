import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function SignInPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>
          Sign in to continue your risk analysis or review your plan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <SignInForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
