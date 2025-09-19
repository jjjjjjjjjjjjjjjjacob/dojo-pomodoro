"use client";
import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import Link from "next/link";
import { SignedIn, useAuth, useSession } from "@clerk/nextjs";
import { useTracking } from "@/app/hooks/use-tracking";

export default function Home() {
  const { isSignedIn, orgRole, has } = useAuth();

  const isHost = useMemo(() => {
    if (!isSignedIn) return false;
    if (orgRole && ["admin", "host"].includes(orgRole)) return true;
    if (typeof has === "function") return has({ role: "org:admin" });
    return false;
  }, [isSignedIn, orgRole, has]);
  const isDoor = useMemo(() => {
    if (!isSignedIn) return false;
    if (orgRole && ["admin", "host", "door"].includes(orgRole)) return true;
    if (typeof has === "function")
      return has({ role: "org:admin" }) || has({ role: "org:member" });
    return false;
  }, [isSignedIn, orgRole, has]);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const resolve = useAction(api.credentialsNode.resolveEventByPassword);
  const { trackPageView, trackEvent, trackError } = useTracking();

  // Track home page view
  useEffect(() => {
    trackPageView("Home Page");
  }, [trackPageView]);

  const onSubmit = useCallback(async () => {
    const normalizedPassword = password.trim();
    console.log('[DEBUG] Home page password entry:', {
      original: password,
      normalized: normalizedPassword,
      length: normalizedPassword.length
    });
    if (!normalizedPassword) {
      setMessage("Enter your list code.");
      return;
    }
    try {
      setLoading(true);
      setMessage("");
      console.log('[DEBUG] Sending password to backend:', normalizedPassword);
      const res = await resolve({ password: normalizedPassword });
      if (res?.ok && res.eventId) {
        trackEvent("Event Access", {
          eventId: res.eventId,
          method: "password",
        });
        // Pass the code along in search params to the event page
        const searchParams = new URLSearchParams({
          password: normalizedPassword,
        }).toString();
        router.push(`/events/${res.eventId}?${searchParams}`);
      } else {
        trackError("Invalid Event Password", {
          password: normalizedPassword,
        });
        setMessage("No active event matches that password.");
      }
    } catch (error: unknown) {
      const errorDetails = error as Error;
      setMessage(errorDetails?.message || "Error resolving event");
    } finally {
      setLoading(false);
    }
  }, [password, resolve, router]);

  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-semibold text-primary">
          Enter Event Password
        </h1>
        <p className="text-sm text-foreground/70 text-primary">
          Enter the password you received to access your event.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value.trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
            className="border border-primary/20 placeholder:text-primary/30"
          />
          <Button onClick={onSubmit} disabled={loading}>
            {loading ? "Checking..." : "Continue"}
          </Button>
        </div>
        {message && <div className="text-sm text-red-500">{message}</div>}
      </div>
    </main>
  );
}
