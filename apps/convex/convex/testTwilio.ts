/**
 * Comprehensive Twilio SMS testing and debugging utilities
 * Consolidated from debugSms.ts for simpler testing interface
 */

"use node";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import twilio from "twilio";

/**
 * Test Twilio SMS integration
 * Call this from Convex dashboard to verify SMS functionality
 */
export const testTwilioSms = action({
  args: {
    testPhoneNumber: v.string(),
    testMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      // Test simple SMS sending
      const result = await ctx.runAction(internal.smsActions.sendSmsInternal, {
        phoneNumber: args.testPhoneNumber,
        message: args.testMessage || "🎉 Twilio SMS test from Dojo Events - working perfectly!",
      });

      return {
        success: true,
        message: "Twilio SMS sent successfully",
        result,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  },
});

/**
 * Test phone number formatting to E.164 format
 */
export const testPhoneFormatting = action({
  args: {
    phoneNumbers: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const results = [];

    for (const phone of args.phoneNumbers) {
      const digitsOnly = phone.replace(/\D/g, "");
      const formattedOptions = [];

      // Show different formatting options
      if (digitsOnly.length === 10) {
        formattedOptions.push(`+1${digitsOnly}`);
        formattedOptions.push(`1${digitsOnly}`);
      }

      if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
        formattedOptions.push(`+${digitsOnly}`);
      }

      if (!phone.startsWith("+")) {
        formattedOptions.push(`+${digitsOnly}`);
      }

      results.push({
        original: phone,
        digitsOnly,
        length: digitsOnly.length,
        formattedOptions,
        recommended: digitsOnly.length === 10 ? `+1${digitsOnly}` : `+${digitsOnly}`,
      });
    }

    return {
      success: true,
      results,
      provider: "Twilio",
    };
  },
});

/**
 * Test Twilio account status and balance
 */
export const testTwilioAccount = action({
  args: {},
  handler: async (ctx, args) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      return {
        success: false,
        error: "Twilio credentials not configured"
      };
    }

    const twilioClient = twilio(accountSid, authToken);

    try {
      const account = await twilioClient.api.accounts(accountSid).fetch();
      const balance = await twilioClient.api.accounts(accountSid).balance.fetch();

      return {
        success: true,
        account: {
          sid: account.sid,
          friendlyName: account.friendlyName,
          status: account.status,
          type: account.type,
        },
        balance: {
          balance: balance.balance,
          currency: balance.currency,
        },
        fromNumber: process.env.TWILIO_PHONE_NUMBER,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        code: error.code || error.status,
        timestamp: new Date().toISOString(),
      };
    }
  },
});

/**
 * Send test SMS and check delivery status
 * Combines SMS sending with account verification
 */
export const checkTwilioStatus = action({
  args: {
    testPhoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return { error: "Twilio credentials not configured" };
    }

    const twilioClient = twilio(accountSid, authToken);

    try {
      // Format phone number
      const digitsOnly = args.testPhoneNumber.replace(/\D/g, "");
      let formattedPhone = args.testPhoneNumber;

      if (digitsOnly.length === 10) {
        formattedPhone = `+1${digitsOnly}`;
      } else if (!args.testPhoneNumber.startsWith("+")) {
        formattedPhone = `+${digitsOnly}`;
      }

      // Send test SMS
      const message = await twilioClient.messages.create({
        body: "Test SMS from Dojo Pomodoro - if you receive this, SMS is working!",
        from: fromNumber,
        to: formattedPhone,
      });

      // Get account info
      const account = await twilioClient.api.accounts(accountSid).fetch();

      return {
        success: true,
        messageId: message.sid,
        messageSid: message.sid,
        formattedPhone,
        originalPhone: args.testPhoneNumber,
        fromNumber,
        accountSid,
        accountStatus: account.status,
        timestamp: new Date().toISOString(),
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