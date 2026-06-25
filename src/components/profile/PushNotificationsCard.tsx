import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePushSubscription } from "@/hooks/usePushSubscription";

export default function PushNotificationsCard() {
  const {
    supported,
    permission,
    isSubscribed,
    loading,
    vapidConfigured,
    subscribe,
    unsubscribe,
    error,
  } = usePushSubscription();

  let statusText: string;
  if (!supported) {
    statusText = "This browser does not support push notifications.";
  } else if (!vapidConfigured) {
    statusText = "Push notifications haven't been set up by the workshop admin yet.";
  } else if (permission === "denied") {
    statusText =
      "Notifications are blocked for this site. Enable them in your browser settings, then try again.";
  } else if (isSubscribed) {
    statusText = "You're subscribed. We'll send you a notification for important updates.";
  } else {
    statusText = "Get real-time alerts for invoices, jobs, and appointments.";
  }

  const canSubscribe = supported && vapidConfigured && permission !== "denied" && !isSubscribed;
  const canUnsubscribe = isSubscribed;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Push Notifications</CardTitle>
        </div>
        <CardDescription>
          Receive alerts on this device, even when the app isn't open.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{statusText}</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {canSubscribe && (
            <Button size="sm" onClick={() => void subscribe()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Bell className="h-4 w-4 mr-1" />}
              Enable notifications
            </Button>
          )}
          {canUnsubscribe && (
            <Button size="sm" variant="outline" onClick={() => void unsubscribe()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <BellOff className="h-4 w-4 mr-1" />}
              Turn off notifications
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
