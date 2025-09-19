"use client";
import React, { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

export default function EventPageClient({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn, isLoaded } = useAuth();

  const eventQuery = useQuery(
    convexQuery(api.events.get, { eventId: eventId as Id<"events"> }),
  );
  const event = eventQuery.data;

  const queryParamPassword = searchParams?.get("password") || "";
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  // Pre-fill password from query params
  useEffect(() => {
    if (queryParamPassword && !password) {
      setPassword(queryParamPassword);
    }
  }, [queryParamPassword, password]);

  const onSubmitLocal = useCallback(() => {
    const passwordValue = password.trim();
    if (!passwordValue) {
      setMessage("Enter your list password.");
      return;
    }
    setMessage("");
    setIsLoading(true);

    const searchParameters = new URLSearchParams({
      password: passwordValue,
    }).toString();

    if (isSignedIn) {
      // If signed in, go to RSVP page with password - layout will handle routing
      router.push(`/events/${eventId}/rsvp?${searchParameters}`);
    } else {
      // Not signed in: redirect to sign-in with intended destination
      const requestUrl = `/events/${eventId}/rsvp?${searchParameters}`;
      router.push(`/sign-in?redirect_url=${encodeURIComponent(requestUrl)}`);
    }
    setIsLoading(false);
  }, [password, isSignedIn, eventId, router]);

  const dateText = useMemo(() => {
    const timestamp = event?.eventDate;
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const day = date.toLocaleDateString(undefined, { weekday: "long" });
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const dayOfMonth = String(date.getDate()).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    return `${day} ${month}.${dayOfMonth}.${year}`;
  }, [event?.eventDate]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      {eventQuery.isLoading || !event ? (
        <div className="flex text-primary items-center justify-center py-10 animate-in fade-in">
          <Spinner />
        </div>
      ) : (
        <header className="w-full max-w-2xl space-y-4 text-center text-primary animate-in! fade-in! duration-1000">
          <h1 className="text-4xl font-semibold uppercase">{event.name}</h1>
          <div>
            <div className="text-lg leading-tight">{dateText}</div>
            <div className="text-lg leading-tight">{event?.location}</div>
          </div>
          <div className="mt-2">
            <Dialog>
              <DialogTrigger
                asChild
                onClick={() => {
                  if (password) onSubmitLocal();
                }}
              >
                <Button>RSVP</Button>
              </DialogTrigger>
              <DialogContent className="text-primary">
                <DialogHeader className="text-primary">
                  <DialogTitle>Enter List Password</DialogTitle>
                  <DialogDescription className="text-primary">
                    Provide the password for your guest list to continue.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    placeholder="List password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSubmitLocal();
                    }}
                    className="flex-1 border border-primary/20 placeholder:text-primary/30"
                  />
                  <Button onClick={onSubmitLocal} disabled={isLoading}>
                    {isLoading ? "Continuing…" : "Continue"}
                  </Button>
                </div>
                {message && (
                  <div className="text-sm text-red-500">{message}</div>
                )}
                <DialogFooter />
              </DialogContent>
            </Dialog>
          </div>
        </header>
      )}
    </main>
  );
}
