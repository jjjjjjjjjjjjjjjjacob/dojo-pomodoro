"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

type ApprovalEventSummary = {
  name: string;
  location: string;
  eventDate: number;
};

type EncryptedProfile = {
  phoneEnc?: {
    ivB64: string;
    ctB64: string;
    tagB64: string;
  };
  phoneObfuscated?: string;
};

type SmsSendResult = {
  messageId: string;
  phone: string;
};

type ApprovalSmsSuccess = {
  success: true;
  messageId: string;
  phone: string;
  notificationId: Id<"smsNotifications">;
};

type ApprovalSmsSkipReason =
  | "no_share"
  | "missing_env"
  | "no_event"
  | "no_phone"
  | "send_failed";

type ApprovalSmsSkipped = {
  skipped: ApprovalSmsSkipReason;
  error?: string;
};

type ApprovalSmsResult = ApprovalSmsSuccess | ApprovalSmsSkipped;

function fmtDate(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString();
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
  const eventDate = fmtDate(event.eventDate);
  const ticketUrl = `${baseUrl}/redeem/${code}`;

  return `🎉 Your RSVP for ${event.name} is approved!

📅 ${eventDate}
📍 ${event.location}

🎫 Your ticket: ${ticketUrl}

Show this link at the door for entry.`;
}

export const sendApprovalSms = action({
  args: {
    eventId: v.id("events"),
    clerkUserId: v.string(),
    listKey: v.string(),
    code: v.string(),
    shareContact: v.boolean(),
  },
  handler: async (ctx, args): Promise<ApprovalSmsResult> => {
    if (!args.shareContact) return { skipped: "no_share" };

    // Check required environment variables
    const baseUrl = process.env.APP_BASE_URL;
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!baseUrl || !twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      return { skipped: "missing_env" };
    }

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

    try {
      // Decrypt phone number
      const decryptedPhone = await ctx.runAction(
        internal.profilesNode.decryptPhoneInternal,
        {
          phoneEnc: profile.phoneEnc,
        },
      );

      // Create SMS notification record
      const notificationId = await ctx.runMutation(
        internal.sms.createNotification,
        {
          eventId: args.eventId,
          recipientClerkUserId: args.clerkUserId,
          recipientPhoneObfuscated: profile.phoneObfuscated || "***-***-****",
          type: "approval",
          message: formatApprovalMessage(event as ApprovalEventSummary, args.code, baseUrl),
        },
      );

      // Send SMS via Twilio
      const result = (await ctx.runAction(internal.smsActions.sendSmsInternal, {
        phoneNumber: decryptedPhone,
        message: formatApprovalMessage(event as ApprovalEventSummary, args.code, baseUrl),
        notificationId,
      })) as SmsSendResult;

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
