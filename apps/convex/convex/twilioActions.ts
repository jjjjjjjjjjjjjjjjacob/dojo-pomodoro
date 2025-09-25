/**
 * Twilio actions that require Node.js runtime
 */

"use node";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import twilio from "twilio";

/**
 * Send help response via Twilio
 */
export const sendHelpResponse = internalAction({
  args: {
    to: v.string(),
    from: v.string(),
  },
  handler: async (ctx, args) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      console.error("Twilio credentials not configured");
      return;
    }

    try {
      const twilioClient = twilio(accountSid, authToken);

      await twilioClient.messages.create({
        body: "Dojo Events SMS. Reply STOP to opt-out, START to opt-in. Questions? Visit our website.",
        from: args.from,
        to: args.to,
      });

      console.log(`Help response sent to ${args.to}`);
    } catch (error: any) {
      console.error("Failed to send help response:", error);
    }
  },
});