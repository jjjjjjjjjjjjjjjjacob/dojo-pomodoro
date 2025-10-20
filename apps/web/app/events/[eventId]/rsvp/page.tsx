"use client";
import React, { use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useUser, useClerk, UserProfile } from "@clerk/nextjs";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  validateRequired,
  validateRequiredWithFirstName,
} from "@/lib/mini-zod";
import { useForm, type Path } from "react-hook-form";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { GuestInfoFields } from "@/components/guest-info-form";
import { Spinner } from "@/components/ui/spinner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/components/ui/context-menu";
import QRCode from "react-qr-code";
import { QrCode, ToggleLeft, ToggleRight } from "lucide-react";
import {
  Event,
  User,
  ClerkUser,
  RSVPFormData,
  CustomField,
  ApplicationError,
  UseFormReturn,
} from "@/lib/types";
import { useTracking } from "@/app/hooks/use-tracking";

export default function RsvpPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const { openUserProfile } = useClerk();
  const { trackPageView, trackRSVPSubmission, trackError } = useTracking();

  const status = useQuery(api.rsvps.statusForUserEvent, {
    eventId: eventId as Id<"events">,
  });
  const event = useQuery(api.events.get, { eventId: eventId as Id<"events"> });
  const userDoc = useQuery(
    api.users.getByClerkUser,
    user?.id ? { clerkUserId: user.id } : "skip",
  ) as User | undefined;
  const myRedemption = useQuery(
    api.redemptions.forCurrentUserEvent,
    status?.status === "approved" || status?.status === "attending"
      ? { eventId: eventId as Id<"events"> }
      : "skip",
  );

  const password = (searchParams?.get("password") || "").trim();
  /*
  console.log("[DEBUG] RSVP page password from URL:", {
    raw: searchParams?.get("password"),
    trimmed: password,
    length: password.length,
  });
  */
  const [listKey, setListKey] = useState<string | null>(null);
  const [name, setName] = useState<string>(""); // Keep during migration phase
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [smsConsentEnabled, setSmsConsentEnabled] = useState<boolean>(true);
  const [hasInitializedSmsConsent, setHasInitializedSmsConsent] =
    useState<boolean>(false);

  const resolve = useAction(api.credentialsNode.resolveListByPassword);
  const upsertContact = useAction(api.profilesNode.upsertEncryptedContact);
  const submitRsvp = useMutation(api.rsvps.submitRequest);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const form = useForm<RSVPFormData>({
    defaultValues: {
      name: "",
      firstName: "",
      lastName: "",
      custom: {},
      attendees: 1,
    },
  });

  // Guard: password requirement
  useEffect(() => {
    if (!password) {
      router.replace(`/events/${eventId}`);
      return;
    }
  }, [password, eventId, router]);

  // Track page view
  useEffect(() => {
    if (event) {
      trackPageView("RSVP Page", {
        eventId,
        eventName: event.name,
      });
    }
  }, [event, eventId, trackPageView]);

  // Resolve list by password
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!password) return;
      try {
        setChecking(true);
        /*
        console.log("[DEBUG] Resolving password with backend:", {
          eventId,
          password,
          passwordLength: password.length,
        });
        */
        const res = await resolve({
          eventId: eventId as Id<"events">,
          password,
        });
        // console.log("[DEBUG] Password resolution result:", res);
        if (!cancelled) {
          if (res?.ok) {
            // console.log("[DEBUG] Password resolved to list:", res.listKey);
            setListKey(res.listKey);
          } else {
            // console.log("[DEBUG] Password resolution failed");
            setMessage("Invalid password for this event.");
          }
        }
      } catch (error: unknown) {
        const errorDetails = error as ApplicationError | Error;
        if (!cancelled)
          setMessage(errorDetails?.message || "Error validating password");
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [password, eventId, resolve]);

  // Prefill from existing RSVP data and Clerk profile
  useEffect(() => {
    if (!event) return;
    // Name prefill - support both old and new field structure
    if (!firstName && !lastName) {
      let first = "";
      let last = "";
      let fullName = "";

      // Try to get from user document first
      if (userDoc?.firstName || userDoc?.lastName) {
        first = userDoc.firstName || "";
        last = userDoc.lastName || "";
        fullName = `${first} ${last}`.trim();
      } else if (user?.firstName || user?.lastName) {
        // Fallback to Clerk user data
        first = user.firstName || "";
        last = user.lastName || "";
        fullName = user.fullName || `${first} ${last}`.trim();
      }

      if (first || last) {
        setFirstName(first);
        setLastName(last);
        setName(fullName); // Keep backward compatibility
      }
    }
    // Custom fields prefill
    if (event?.customFields?.length) {
      setCustom((prev) => {
        const next = { ...prev } as Record<string, string>;
        for (const customField of event.customFields || []) {
          const key = customField.key;
          const existing = next[key];
          if (existing) continue;
          const fromStatus = status?.customFieldValues?.[key];
          if (fromStatus) {
            next[key] = fromStatus;
          }
        }
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.customFields, status?.customFieldValues, userDoc?._id, user?.id]);

  // Sync RHF form values from local state for name/custom
  useEffect(() => {
    form.setValue("name", name, { shouldValidate: false, shouldDirty: false });
    form.setValue("firstName", firstName, {
      shouldValidate: false,
      shouldDirty: false,
    });
    form.setValue("lastName", lastName, {
      shouldValidate: false,
      shouldDirty: false,
    });
    const current = form.getValues("custom") || {};
    const next: Record<string, string> = { ...current, ...custom };
    form.setValue("custom", next, {
      shouldValidate: false,
      shouldDirty: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, firstName, lastName, JSON.stringify(custom)]);

  // Prefill from Clerk profile
  const phone = useMemo(() => {
    const clerkUser = user as ClerkUser | undefined;
    return (
      (clerkUser?.primaryPhoneNumber?.phoneNumber ||
        clerkUser?.phoneNumbers?.[0]?.phoneNumber) ??
      ""
    );
  }, [user]);

  const deniedForThisList = useMemo(() => {
    return (
      status?.status === "denied" && !!listKey && status.listKey === listKey
    );
  }, [status?.status, status?.listKey, listKey]);

  const updateProfileMeta = useMutation(api.users.updateProfileMeta);
  const onSubmit = async () => {
    try {
      setMessage("");
      if (!listKey) {
        setMessage("Missing list access. Please re-enter your password.");
        return;
      }
      const errs = validateRequiredWithFirstName(
        firstName,
        custom,
        (event?.customFields || []).map((customField) => ({
          key: customField.key,
          label: customField.label || customField.key,
          required: customField.required,
        })),
      );
      if (errs.length) {
        const perField: Record<string, string> = {};
        for (const e of errs) {
          if (e.toLowerCase().includes("first name")) {
            perField.firstName = e;
            form.setError("firstName", { type: "required", message: e });
          }
        }
        for (const customField of event?.customFields || []) {
          const label = customField.label || customField.key;
          const message = `${label} is required`;
          if (errs.includes(message)) {
            const fieldPath = `custom.${customField.key}` as Path<RSVPFormData>
            form.setError(fieldPath, {
              type: "required",
              message,
            });
          }
        }
        setFieldErrors(perField);
        const message = errs.join("\n");
        setMessage(message);
        toast.error("Missing required fields", { description: message });
        return;
      }
      if (!phone) {
        setMessage("Add a phone in your profile.");
        return;
      }
      if (deniedForThisList) {
        setMessage("You were denied for this list. Try another password.");
        return;
      }
      setSubmitting(true);
      await updateProfileMeta({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      const filteredCustomFields = Object.fromEntries(
        (event?.customFields || [])
          .map((customField) => {
            const value = custom[customField.key];
            return value ? [customField.key, value] : null;
          })
          .filter(
            (
              entry,
            ): entry is [string, string] => entry !== null,
          ),
      );
      await upsertContact({
        phone: phone || undefined,
      });

      await submitRsvp({
        eventId: eventId as Id<"events">,
        listKey,
        note: note || undefined,
        shareContact: true,
        attendees: form.getValues("attendees") || 1,
        smsConsent: smsConsentEnabled,
        smsConsentIpAddress: undefined, // Not needed for implicit consent
        customFields: filteredCustomFields,
      });

      trackRSVPSubmission({
        eventId,
        eventName: event?.name,
        listKey: listKey || undefined,
      });

      toast.success("RSVP submitted");
      router.replace(`/events/${eventId}/status`);
    } catch (error: unknown) {
      const errorDetails = error as ApplicationError | Error;
      const message = errorDetails?.message || "Failed to submit request";
      setMessage(message);

      trackError("RSVP Submission Failed", {
        eventId,
        eventName: event?.name,
        listKey: listKey || undefined,
        error: message,
      });

      toast.error("Request failed", { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (hasInitializedSmsConsent) return;
    if (status?.smsConsent !== undefined) {
      setSmsConsentEnabled(status.smsConsent);
      setHasInitializedSmsConsent(true);
    }
  }, [status?.smsConsent, hasInitializedSmsConsent]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      {!event ? (
        <div className="flex items-center justify-center py-10 text-primary">
          <Spinner />
        </div>
      ) : (
        <div className="w-full max-w-2xl space-y-6 text-center animate-in fade-in">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold text-primary">RSVP</h1>
            <p className="text-sm text-primary/70">{event?.name ?? ""}</p>
            {listKey && (
              <div className="text-xs text-primary/70">
                Guest list: <span className="font-medium">{listKey}</span>
              </div>
            )}
          </header>

          {checking ? (
            <div className="flex justify-center m-auto text-sm text-primary">
              <Spinner />
            </div>
          ) : listKey ? (
            <section className="space-y-3 text-left mx-auto max-w-xl">
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-3"
                >
                  <GuestInfoFields
                    form={form}
                    event={event as Event}
                    name={name}
                    setName={setName}
                    firstName={firstName}
                    setFirstName={setFirstName}
                    lastName={lastName}
                    setLastName={setLastName}
                    custom={custom}
                    setCustom={setCustom}
                    phone={phone}
                    openUserProfile={openUserProfile}
                    isSignedIn={!!user}
                  />

                  <div className="rounded border border-primary/30 p-3 space-y-2">
                    <div className="font-medium text-xs text-primary">
                      NOTE FOR HOSTS (optional)
                    </div>
                    <Textarea
                      placeholder="Anything hosts should know"
                      className="border border-primary/20 placeholder:text-primary/30 text-primary"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <label
                      htmlFor="sms-opt-in"
                      className="flex items-center gap-2 text-sm text-primary"
                    >
                      <Checkbox
                        id="sms-opt-in"
                        checked={smsConsentEnabled}
                        onCheckedChange={(checked) =>
                          setSmsConsentEnabled(checked === true)}
                        defaultChecked={smsConsentEnabled}
                      />
                      <span>Opt in to SMS notifications</span>
                    </label>
                    <Button
                      type="submit"
                      disabled={
                        submitting ||
                        !phone ||
                        deniedForThisList ||
                        form.formState.isSubmitting
                      }
                    >
                      {submitting ? "Submitting…" : "Submit Request"}
                    </Button>
                  </div>
                </form>
              </Form>
              {deniedForThisList && (
                <div className="text-sm text-red-500">
                  You were denied for this list. Try another password.
                </div>
              )}
              {message && <div className="text-sm text-red-500">{message}</div>}

              {/* QR Code and Redemption Status Context Menu - only show if approved */}
              {(status?.status === "approved" ||
                status?.status === "attending") &&
                myRedemption && (
                  <div className="rounded border border-primary/20 p-3 space-y-2 mt-4">
                    <div className="font-medium text-sm text-primary">
                      Ticket Management
                    </div>
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <Button variant="outline" className="w-full">
                          <QrCode className="w-4 h-4 mr-2" />
                          Right-click for options
                        </Button>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-48">
                        <ContextMenuItem
                          onClick={() => setShowQRCode(!showQRCode)}
                        >
                          <QrCode className="w-4 h-4 mr-2" />
                          {showQRCode ? "Hide" : "Show"} QR Code
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuSub>
                          <ContextMenuSubTrigger>
                            <ToggleLeft className="w-4 h-4 mr-2" />
                            Redemption Status
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent>
                            <ContextMenuItem disabled>
                              <span className="text-sm font-medium">
                                Current: Issued
                              </span>
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem disabled>
                              <span className="text-xs text-muted-foreground">
                                Status managed by hosts
                              </span>
                            </ContextMenuItem>
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                      </ContextMenuContent>
                    </ContextMenu>

                    {/* QR Code Display */}
                    {showQRCode && myRedemption && (
                      <div className="flex flex-col items-center gap-2 pt-2">
                        <QRCode
                          value={`${window.location.origin}/redeem/${myRedemption.code}`}
                          size={240}
                          fgColor="var(--primary)"
                        />
                        <div className="text-xs text-primary/80 text-center">
                          Show this QR code at the door
                        </div>
                        <div className="text-xs text-primary/60 text-center">
                          List: {myRedemption.listKey?.toUpperCase() || 'N/A'}
                        </div>
                      </div>
                    )}
                  </div>
                )}
            </section>
          ) : (
            <div className="text-sm text-red-500">
              {message || "Access denied"}
            </div>
          )}
        </div>
      )}
      {/* Hidden UserProfile component for Clerk modal functionality - only render when signed in */}
      {user && (
        <div style={{ display: "none" }}>
          <UserProfile />
        </div>
      )}
    </main>
  );
}
