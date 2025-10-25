"use client";
import React, { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMutation, useQuery as useConvexQuery } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAuth } from "@clerk/nextjs";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { getEventThemeColors } from "@/lib/event-theme";

export default function StatusPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const { isSignedIn, isLoaded } = useAuth();
  const updateSmsPreference = useMutation(api.rsvps.updateSmsPreference);
  const [isUpdatingSmsPreference, setIsUpdatingSmsPreference] = React.useState(false);

  // Only query when auth is loaded and user is signed in
  const statusQuery = useQuery(
    convexQuery(
      api.rsvps.statusForUserEvent,
      isLoaded && isSignedIn ? { eventId: eventId as Id<"events"> } : "skip",
    ),
  );
  const eventQuery = useQuery(convexQuery(api.events.get, { eventId: eventId as Id<"events"> }));

  const status = statusQuery.data;
  const event = eventQuery.data;
  const eventThemeColors = React.useMemo(
    () => getEventThemeColors(event ?? null),
    [event],
  );
  const guestPortalImageResponse = useConvexQuery(
    api.files.getUrl,
    event?.guestPortalImageStorageId
      ? { storageId: event.guestPortalImageStorageId as Id<"_storage"> }
      : "skip",
  );
  const guestPortalLinkLabel = event?.guestPortalLinkLabel?.trim() ?? "";
  const guestPortalLinkUrl = event?.guestPortalLinkUrl?.trim() ?? "";
  const shouldShowGuestLink = guestPortalLinkLabel.length > 0 && guestPortalLinkUrl.length > 0;
  const guestPortalImageUrl = guestPortalImageResponse?.url ?? null;

  const handleSmsPreferenceChange = async (desiredSmsConsent: boolean) => {
    if (!status?.rsvpId) return;
    try {
      setIsUpdatingSmsPreference(true);
      await updateSmsPreference({
        rsvpId: status.rsvpId as Id<"rsvps">,
        smsConsent: desiredSmsConsent,
      });
      await statusQuery.refetch();
      toast.success(
        desiredSmsConsent
          ? "SMS notifications enabled."
          : "SMS notifications disabled.",
      );
    } catch (error) {
      const errorDetails = error as Error;
      toast.error(
        errorDetails.message ||
          (desiredSmsConsent
            ? "Failed to enable SMS notifications."
            : "Failed to disable SMS notifications."),
      );
    } finally {
      setIsUpdatingSmsPreference(false);
    }
  };

  // Show loading while auth is initializing
  if (!isLoaded) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="flex items-center text-primary justify-center py-10">
          <Spinner />
        </div>
      </main>
    );
  }

  // If not signed in (shouldn't happen due to middleware, but safety check)
  if (!isSignedIn) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center text-red-500">
          <p>Please sign in to view your RSVP status.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      {eventQuery.isLoading || statusQuery.isLoading || !event ? (
        <div className="flex items-center text-primary justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="w-full max-w-2xl space-y-6 text-center">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold text-primary">RSVP Status</h1>
            <div className="space-y-1 text-primary">
              <p className="text-3xl font-semibold leading-tight">
                {event.name}
              </p>
              {event.secondaryTitle?.trim() && (
                <p className="text-2xl leading-tight text-primary/85 font-medium">
                  {event.secondaryTitle}
                </p>
              )}
              {event.location && (
                <p className="text-sm text-primary/70">{event.location}</p>
              )}
            </div>
          </header>
          {(guestPortalImageUrl || shouldShowGuestLink) && (
            <section className="space-y-3 rounded-lg border border-primary/15 bg-card/70 p-4">
              {guestPortalImageUrl && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={guestPortalImageUrl}
                    alt={event?.name ? `${event.name} guest info` : "Event guest information"}
                    className="max-h-64 w-full rounded-md object-cover"
                  />
                </div>
              )}
              {shouldShowGuestLink && (
                <div className="flex justify-center">
                  <Button asChild variant="outline">
                    <a
                      href={guestPortalLinkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium"
                    >
                      {guestPortalLinkLabel}
                    </a>
                  </Button>
                </div>
              )}
            </section>
          )}
          {status?.status === "pending" && (
            <div className="flex flex-col text-sm text-primary gap-2">
              <p>
                Your request is{" "}
                <span className="font-medium">pending host approval</span>.
                You’ll receive instructions once approved.
              </p>
              <p className="font-medium">
                IMPORTANT: Approval is necessary to access the event.
              </p>
            </div>
          )}
          {status && (
            <div className="flex flex-col gap-2 items-center text-sm text-primary">
              {status.smsConsent ? (
                <div className="flex flex-col items-center gap-3">
                  <div
                    className="flex items-center gap-2 text-sm font-medium"
                    style={{ color: eventThemeColors.textColor }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>SMS notifications enabled</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    className="min-w-[7rem]"
                    onClick={() => handleSmsPreferenceChange(false)}
                    disabled={
                      statusQuery.isLoading ||
                      statusQuery.isFetching ||
                      isUpdatingSmsPreference
                    }
                  >
                    {isUpdatingSmsPreference && (
                      <Spinner className="h-3.5 w-3.5" />
                    )}
                    SMS On
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2 text-primary/80">
                    <CircleDashed className="h-4 w-4" />
                    <span>SMS notifications off</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSmsPreferenceChange(true)}
                    disabled={
                      statusQuery.isLoading ||
                      statusQuery.isFetching ||
                      isUpdatingSmsPreference
                    }
                  >
                    {isUpdatingSmsPreference && (
                      <Spinner className="h-3.5 w-3.5" />
                    )}
                    Enable SMS Updates
                  </Button>
                </div>
              )}
            </div>
          )}
          {status?.status === "denied" && (
            <div className="text-sm">
              Sorry, you were denied. You can try a different list password.
            </div>
          )}
          {!status?.status && (
            <div className="text-sm text-foreground/70">
              No request on file yet.
            </div>
          )}
        </div>
      )}
    </main>
  );
}
