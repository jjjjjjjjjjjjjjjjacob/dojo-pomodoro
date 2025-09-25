/**
 * Simple SMS test with Twilio
 */

"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import twilio from "twilio";

export const sendSimpleSms = action({
  args: {
    phoneNumber: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return {
        success: false,
        error: "Twilio credentials not configured",
      };
    }

    const twilioClient = twilio(accountSid, authToken);

    try {
      // Send simple SMS
      const message = await twilioClient.messages.create({
        body: args.message || "Simple test from Dojo - Twilio SMS working!",
        from: fromNumber,
        to: args.phoneNumber,
      });

      return {
        success: true,
        messageId: message.sid,
        messageSid: message.sid,
        phone: args.phoneNumber,
        status: message.status,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        code: error.code || error.status,
        moreInfo: error.moreInfo,
      };
    }
  },
});