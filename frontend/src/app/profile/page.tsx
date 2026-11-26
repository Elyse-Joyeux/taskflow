"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { api, getToken } from "@/lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Profile = { id: string; display_name: string; email: string; created_at: string };

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<Profile>("/api/me")
      .then(setProfile)
      .catch((e) => setError(e.message));
  }, [router]);

  return (
    <AppShell>
      <div className="profile-wrap">
        <Link className="back-link" href="/projects">
          <ArrowLeft aria-hidden="true" size={15} /> Back to workspace
        </Link>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {profile && (
          <>
            <section className="profile-hero">
              <span className="profile-avatar profile-avatar-hero">
                {profile.display_name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <span className="workspace-overline">TASKFLOW MEMBER</span>
                <h1>{profile.display_name}</h1>
                <p>{profile.email}</p>
              </div>
              <Link className={buttonVariants()} href="/settings">
                Edit profile <ArrowUpRight aria-hidden="true" data-icon="inline-end" />
              </Link>
            </section>
            <section className="profile-detail-grid">
              <Card className="settings-card">
                <CardHeader>
                  <span className="workspace-overline">ABOUT YOUR ACCOUNT</span>
                  <CardTitle>Good work starts here.</CardTitle>
                </CardHeader>
                <CardContent>
                <p>
                  Your Taskflow account is where you organize projects, collaborate with
                  teammates, and keep track of the work that matters.
                </p>
                <div className="profile-fact">
                  <span>Member since</span>
                  <b>
                    {new Date(profile.created_at).toLocaleDateString(undefined, {
                      month: "long",
                      year: "numeric",
                    })}
                  </b>
                </div>
                <div className="profile-fact">
                  <span>Account email</span>
                  <b>{profile.email}</b>
                </div>
                </CardContent>
              </Card>
              <article className="profile-settings-promo">
                <span className="settings-icon">⚙</span>
                <h2>Make it yours</h2>
                <p>Update your personal details or change your password in account settings.</p>
                <Link href="/settings">Go to account settings <ArrowRight aria-hidden="true" size={15} /></Link>
              </article>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
