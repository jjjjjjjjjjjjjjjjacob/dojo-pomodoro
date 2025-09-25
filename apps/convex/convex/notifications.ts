"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

function fmtDate(ms: number) {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "";
  }
}

function formatApprovalMessage(event: any, code: string, baseUrl: string): string {
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
  handler: async (ctx, args) => {
    if (!args.shareContact) return { skipped: "no_share" as const };

    // Check required environment variables
    const baseUrl = process.env.APP_BASE_URL;
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!baseUrl || !twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      return { skipped: "missing_env" as const };
    }

    // Get event details
    const event = await ctx.runQuery(api.events.get, { eventId: args.eventId });
    if (!event) return { skipped: "no_event" as const };

    // Get user's profile with encrypted phone data
    const profile = await ctx.runQuery(internal.profiles.getByClerkUserIdInternal, {
      clerkUserId: args.clerkUserId,
    });

    if (!profile?.phoneEnc) {
      return { skipped: "no_phone" as const };
    }

    try {
      // Decrypt phone number
      const decryptedPhone = await ctx.runAction(internal.profilesNode.decryptPhoneInternal, {
        phoneEnc: profile.phoneEnc,
      });

      // Create SMS notification record
      const notificationId = await ctx.runMutation(internal.sms.createNotification, {
        eventId: args.eventId,
        recipientClerkUserId: args.clerkUserId,
        recipientPhoneObfuscated: profile.phoneObfuscated || "***-***-****",
        type: "approval",
        message: formatApprovalMessage(event, args.code, baseUrl),
      });

      // Send SMS via Twilio
      const result = await ctx.runAction(internal.smsActions.sendSmsInternal, {
        phoneNumber: decryptedPhone,
        message: formatApprovalMessage(event, args.code, baseUrl),
        notificationId,
      });

      return {
        success: true,
        messageId: result.messageId,
        phone: result.phone,
        notificationId,
      };
    } catch (error: any) {
      console.error("Failed to send approval SMS:", error);
      return {
        skipped: "send_failed" as const,
        error: error.message,
      };
    }
  },
});
