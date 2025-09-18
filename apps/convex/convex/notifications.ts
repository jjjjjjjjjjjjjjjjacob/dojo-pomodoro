"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

function base64Basic(sid: string, token: string) {
  return Buffer.from(`${sid}:${token}`).toString("base64");
}

function fmtDate(ms: number) {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "";
  }
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

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    const baseUrl = process.env.APP_BASE_URL;
    if (
      !accountSid ||
      !authToken ||
      !(from || messagingServiceSid) ||
      !baseUrl
    ) {
      return { skipped: "missing_env" as const };
    }

    const ev = await ctx.runQuery(api.events.get, { eventId: args.eventId });
    if (!ev) return { skipped: "no_event" as const };

    // For now, skip SMS until phone decryption is properly implemented
    return { skipped: "phone_decrypt_not_implemented" as const };
  },
});
