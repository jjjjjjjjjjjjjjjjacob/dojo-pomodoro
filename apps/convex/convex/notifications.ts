"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveEventMessagingBrandName } from "../../shared/event-branding";

type ApprovalEventSummary = {
  name: string;
  location: string;
  eventDate: number;
  eventTimezone?: string;
  hosts?: string[];
  productionCompany?: string;
  approvalMessage?: string;
  qrCodeColor?: string;
};

type SmsConsentEventSummary = {
  name?: string | null;
  secondaryTitle?: string | null;
  hosts?: Array<string | null | undefined> | null;
  eventHostNames?: Array<string | null | undefined> | null;
  productionCompany?: string | null | undefined;
};

type EncryptedProfile = {
  phoneEnc?: {
    ivB64: string;
    ctB64: string;
    tagB64: string;
  };
  phoneObfuscated?: string;
};

type TwilioSendResult = {
  messageId: string;
  phone: string;
};

type SmsActionSuccess = {
  success: true;
  messageId: string;
  phone: string;
  notificationId: Id<"smsNotifications">;
};

type SmsActionSkipReason =
  | "no_share"
  | "missing_env"
  | "no_event"
  | "no_phone"
  | "no_consent"
  | "send_failed";

type SmsActionSkipped = {
  skipped: SmsActionSkipReason;
  error?: string;
};

type SmsActionResult = SmsActionSuccess | SmsActionSkipped;

function fmtDate(timestamp: number, timezone?: string): string {
  try {
    const date = new Date(timestamp);
    // Format date/time in the event's timezone, or UTC if not specified
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone ?? "UTC",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return formatter.format(date);
  } catch (error) {
    console.warn("Failed to format event date", error);
    return "";
  }
}

function formatApprovalMessage(
  event: ApprovalEventSummary,
  code: string,
  baseUrl: string,
): string {
  const ticketUrl = `${baseUrl}/redeem/${code}`;
  
  // Get header (production company or host names)
  const header = getSmsMessageHeader(event as SmsConsentEventSummary);
  
  // Use custom approval message or default
  const approvalMessage = event.approvalMessage?.trim() || 
    `You have been approved for ${event.name.toUpperCase()}. We're looking forward to seeing you.`;

  return `${header}:

${approvalMessage}

View your ticket here: ${ticketUrl}`;
}

function getSmsMessageHeader(
  event: SmsConsentEventSummary,
): string {
  // Production company takes precedence
  if (event.productionCompany?.trim()) {
    return event.productionCompany.trim().toUpperCase();
  }

  // Otherwise use formatted host names
  const hostCandidates = event.eventHostNames ?? event.hosts ?? [];
  const validNames = hostCandidates
    .map((name) => {
      if (!name) return undefined;
      const trimmed = name.trim();
      if (!trimmed) return undefined;
      // Filter out email addresses
      const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (EMAIL_PATTERN.test(trimmed.toLowerCase())) return undefined;
      return trimmed;
    })
    .filter((name): name is string => name !== undefined);

  if (validNames.length === 0) {
    return event.name?.trim().toUpperCase() || "EVENT HOST";
  }
  if (validNames.length === 1) {
    return validNames[0].toUpperCase();
  }
  if (validNames.length === 2) {
    return `${validNames[0].toUpperCase()} & ${validNames[1].toUpperCase()}`;
  }
  
  // 3+ names: "NAME1, NAME2, ..., & NAMEN"
  const allButLast = validNames.slice(0, -1).map(name => name.toUpperCase());
  const last = validNames[validNames.length - 1].toUpperCase();
  return `${allButLast.join(", ")}, & ${last}`;
}

function formatSmsConsentMessage(
  event: SmsConsentEventSummary,
  eventId: Id<"events">,
  baseUrl: string,
  consentEnabled: boolean,
): string {
  const header = getSmsMessageHeader(event);
  const eventLabel = event.name?.trim() || "this event";
  const statusUrl = `${baseUrl}/events/${eventId}/status`;
  
  if (consentEnabled) {
    return `${header}:

SMS updates enabled for ${eventLabel}. We'll text you about RSVP updates.

Reply STOP to cancel.

Manage & View Status: ${statusUrl}`;
  }
  
  return `${header}:

SMS updates disabled for ${eventLabel}. You won't receive texts about the event.

Reply START to opt-in again.

Manage & View Status: ${statusUrl}`;
}

export const sendApprovalSms = action({
  args: {
    eventId: v.id("events"),
    clerkUserId: v.string(),
    listKey: v.string(),
    code: v.string(),
    shareContact: v.boolean(),
  },
  handler: async (ctx, args): Promise<SmsActionResult> => {
    if (!args.shareContact) return { skipped: "no_share" };

    // Check if Twilio is disabled in development
    const isDevDisabled = process.env.DEV_TWILIO_ENABLED === "false";
    if (isDevDisabled) {
      console.warn("⚠️  SMS disabled in development (DEV_TWILIO_ENABLED=false). Skipping approval SMS.");
      return { skipped: "missing_env" };
    }

    // In production (or dev with SMS enabled), validate all required environment variables
    const baseUrl = process.env.APP_BASE_URL;
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

    const missingEnvVars: string[] = [];
    if (!baseUrl) missingEnvVars.push("APP_BASE_URL");
    if (!twilioAccountSid) missingEnvVars.push("TWILIO_ACCOUNT_SID");
    if (!twilioAuthToken) missingEnvVars.push("TWILIO_AUTH_TOKEN");
    if (!twilioPhoneNumber) missingEnvVars.push("TWILIO_PHONE_NUMBER");

    if (missingEnvVars.length > 0) {
      const errorMessage = `Missing required environment variables: ${missingEnvVars.join(", ")}`;
      console.error(`❌ ${errorMessage}`);
      throw new Error(errorMessage);
    }

    // At this point, baseUrl is guaranteed to be a string
    const validatedBaseUrl = baseUrl!;

    // Get event details
    const event = await ctx.runQuery(api.events.get, {
      eventId: args.eventId,
    });
    if (!event) {
      return { skipped: "no_event" };
    }

    // Get user's profile with encrypted phone data
    const profile = (await ctx.runQuery(
      internal.profiles.getByClerkUserIdInternal,
      {
        clerkUserId: args.clerkUserId,
      },
    )) as EncryptedProfile | null;

    if (!profile?.phoneEnc) {
      return { skipped: "no_phone" };
    }

    // Check SMS consent for this RSVP
    const consentCheck = await ctx.runQuery(internal.rsvps.checkSmsConsentForUserEvent, {
      eventId: args.eventId,
      clerkUserId: args.clerkUserId,
    });

    // Check if user has consented to SMS notifications for this event
    if (!consentCheck.hasConsented) {
      return { skipped: "no_consent" };
    }

    try {
      // Decrypt phone number
      const decryptedPhone = await ctx.runAction(
        internal.profilesNode.decryptPhoneInternal,
        {
          phoneEnc: profile.phoneEnc,
        },
      );

      // Check if QR code should be included
      // Get list credentials to check if generateQR is enabled
      const listCredentials = await ctx.runQuery(api.credentials.getCredsForEvent, {
        eventId: args.eventId,
      });
      const matchingCredential = listCredentials.find(
        (credential: Doc<"listCredentials">) => credential.listKey === args.listKey,
      );
      const shouldIncludeQrCode = matchingCredential?.generateQR === true;

      let qrCodeMediaUrl: string | undefined;
      if (shouldIncludeQrCode) {
        // Generate QR code image
        const ticketUrl = `${validatedBaseUrl}/redeem/${args.code}`;
        const qrCodeColor = event.qrCodeColor || "#000000";
        const qrCodeStorageId = await ctx.runAction(
          internal.lib.qrCodeGenerator.generateAndUploadQrCode,
          {
            value: ticketUrl,
            qrCodeColor,
          },
        );
        
        // Get publicly accessible URL for the QR code
        const qrCodeUrl = await ctx.runAction(
          internal.lib.qrCodeGenerator.getQrCodeUrl,
          {
            storageId: qrCodeStorageId,
          },
        );
        qrCodeMediaUrl = qrCodeUrl || undefined;
      }

      // Format approval message
      const approvalMessage = formatApprovalMessage(
        event as ApprovalEventSummary,
        args.code,
        validatedBaseUrl,
      );

      // Create SMS notification record
      const notificationId = await ctx.runMutation(
        internal.sms.createNotification,
        {
          eventId: args.eventId,
          recipientClerkUserId: args.clerkUserId,
          recipientPhoneObfuscated: profile.phoneObfuscated || "***-***-****",
          type: "approval",
          message: approvalMessage,
        },
      );

      // Send SMS/MMS via Twilio
      const result = (await ctx.runAction(internal.smsActions.sendSmsInternal, {
        phoneNumber: decryptedPhone,
        message: approvalMessage,
        notificationId,
        mediaUrl: qrCodeMediaUrl,
        messageType: "Transactional",
      })) as TwilioSendResult;

      return {
        success: true,
        messageId: result.messageId,
        phone: result.phone,
        notificationId,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown error sending approval SMS";
      console.error("Failed to send approval SMS:", error);
      return {
        skipped: "send_failed",
        error: message,
      };
    }
  },
});

export const sendSmsConsentStatusMessage = action({
  args: {
    eventId: v.id("events"),
    clerkUserId: v.string(),
    consentEnabled: v.boolean(),
  },
  handler: async (ctx, args): Promise<SmsActionResult> => {
    // Check if Twilio is disabled in development
    const isDevDisabled = process.env.DEV_TWILIO_ENABLED === "false";
    if (isDevDisabled) {
      console.warn("⚠️  SMS disabled in development (DEV_TWILIO_ENABLED=false). Skipping SMS consent notification.");
      return { skipped: "missing_env" };
    }

    // In production (or dev with SMS enabled), validate all required environment variables
    const baseUrl = process.env.APP_BASE_URL;
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

    const missingEnvVars: string[] = [];
    if (!baseUrl) missingEnvVars.push("APP_BASE_URL");
    if (!twilioAccountSid) missingEnvVars.push("TWILIO_ACCOUNT_SID");
    if (!twilioAuthToken) missingEnvVars.push("TWILIO_AUTH_TOKEN");
    if (!twilioPhoneNumber) missingEnvVars.push("TWILIO_PHONE_NUMBER");

    if (missingEnvVars.length > 0) {
      const errorMessage = `Missing required environment variables: ${missingEnvVars.join(", ")}`;
      console.error(`❌ ${errorMessage}`);
      throw new Error(errorMessage);
    }

    // At this point, baseUrl is guaranteed to be a string
    const validatedBaseUrl = baseUrl!;

    const event = await ctx.runQuery(api.events.get, {
      eventId: args.eventId,
    });
    if (!event) {
      return { skipped: "no_event" };
    }

    const profile = (await ctx.runQuery(
      internal.profiles.getByClerkUserIdInternal,
      {
        clerkUserId: args.clerkUserId,
      },
    )) as EncryptedProfile | null;

    if (!profile?.phoneEnc) {
      return { skipped: "no_phone" };
    }

    try {
      const decryptedPhone = await ctx.runAction(
        internal.profilesNode.decryptPhoneInternal,
        {
          phoneEnc: profile.phoneEnc,
        },
      );

      const message = formatSmsConsentMessage(
        event as SmsConsentEventSummary,
        args.eventId,
        validatedBaseUrl,
        args.consentEnabled,
      );

      const notificationId = await ctx.runMutation(
        internal.sms.createNotification,
        {
          eventId: args.eventId,
          recipientClerkUserId: args.clerkUserId,
          recipientPhoneObfuscated: profile.phoneObfuscated || "***-***-****",
          type: args.consentEnabled
            ? "sms_consent_enabled"
            : "sms_consent_disabled",
          message,
        },
      );

      const result = (await ctx.runAction(internal.smsActions.sendSmsInternal, {
        phoneNumber: decryptedPhone,
        message,
        notificationId,
        messageType: "Transactional",
      })) as TwilioSendResult;

      // If user enabled SMS consent and they have an approved RSVP, send approval message
      if (args.consentEnabled) {
        const approvedRsvpInfo = await ctx.runQuery(
          internal.rsvps.getApprovedRsvpWithRedemption,
          {
            eventId: args.eventId,
            clerkUserId: args.clerkUserId,
          },
        );

        if (approvedRsvpInfo && approvedRsvpInfo.shareContact && approvedRsvpInfo.listKey) {
          // Small delay to ensure opt-in message is sent first
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Send approval message (don't fail if this fails - opt-in message was already sent)
          try {
            await ctx.runAction(api.notifications.sendApprovalSms, {
              eventId: args.eventId,
              clerkUserId: args.clerkUserId,
              listKey: approvedRsvpInfo.listKey,
              code: approvedRsvpInfo.redemptionCode,
              shareContact: approvedRsvpInfo.shareContact,
            });
          } catch (approvalError: unknown) {
            // Log error but don't fail the entire action
            const errorMessage =
              approvalError instanceof Error
                ? approvalError.message
                : "Unknown error sending approval SMS";
            console.error("Failed to send approval SMS after opt-in:", errorMessage);
          }
        }
      }

      return {
        success: true,
        messageId: result.messageId,
        phone: result.phone,
        notificationId,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error sending SMS consent notification";
      console.error("Failed to send SMS consent notification:", error);
      return {
        skipped: "send_failed",
        error: message,
      };
    }
  },
});
