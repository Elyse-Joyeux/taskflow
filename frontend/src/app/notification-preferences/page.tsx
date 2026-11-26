"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { api, getToken } from "@/lib/api";
import { EVENT_TYPE_LABELS, type NotifPreference } from "@/lib/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function NotificationPreferencesPage() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<NotifPreference[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<NotifPreference[]>("/api/notification-preferences")
      .then(setPrefs)
      .catch((reason) => setError(reason.message));
  }, [router]);

  function toggle(eventType: string, field: "in_app" | "email_enabled") {
    setPrefs((items) => items.map((item) => item.event_type === eventType ? { ...item, [field]: !item[field] } : item));
  }

  async function save() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api("/api/notification-preferences", { method: "PATCH", body: JSON.stringify({ preferences: prefs }) });
      setSuccess("Notification preferences saved.");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="wrap" id="main">
        <header className="workspace-intro">
          <div>
            <span className="workspace-overline">YOUR ACCOUNT</span>
            <h1>Notification preferences</h1>
            <p>Choose which events should reach you in Taskflow or by email.</p>
          </div>
        </header>

        {error && <Alert variant="destructive" className="mb-5"><AlertDescription>{error}</AlertDescription></Alert>}
        {success && <Alert className="mb-5" role="status"><AlertDescription>{success}</AlertDescription></Alert>}

        <Card>
          <CardHeader>
            <CardTitle>Event delivery</CardTitle>
            <CardDescription>Choose the channels you want to hear from for each update.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table aria-label="Notification preferences">
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead className="w-28 text-center">In-app</TableHead>
                    <TableHead className="w-28 text-center">Email</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prefs.map((pref) => {
                    const label = EVENT_TYPE_LABELS[pref.event_type] ?? pref.event_type;
                    return (
                      <TableRow key={pref.event_type}>
                        <TableCell className="font-medium">{label}</TableCell>
                        <TableCell className="text-center">
                          <Switch checked={pref.in_app} onCheckedChange={() => toggle(pref.event_type, "in_app")} aria-label={`In-app notifications for ${label}`} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch checked={pref.email_enabled} onCheckedChange={() => toggle(pref.event_type, "email_enabled")} aria-label={`Email notifications for ${label}`} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <CardFooter className="flex flex-wrap items-center justify-between gap-3">
            <p className="field-help">Email notifications require SMTP to be configured on the server.</p>
            <Button disabled={busy} onClick={save}>{busy ? "Saving…" : "Save preferences"}</Button>
          </CardFooter>
        </Card>
      </div>
    </AppShell>
  );
}
