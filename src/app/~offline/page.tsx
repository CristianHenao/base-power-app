import { WifiOff } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function OfflinePage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted">
            <WifiOff className="size-5 text-muted-foreground" />
          </div>
          <CardTitle>You&apos;re offline</CardTitle>
          <CardDescription>
            Base Power needs a connection for this page. Cached screens and maps
            may still be available when you reconnect.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Check your network, then try again.
        </CardContent>
      </Card>
    </main>
  );
}
