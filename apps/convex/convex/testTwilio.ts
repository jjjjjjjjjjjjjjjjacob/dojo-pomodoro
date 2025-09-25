/**
 * Simple test function to verify Twilio SMS functionality
 */

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

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
 * Test phone number formatting
 */
export const testPhoneFormatting = action({
  args: {
    phoneNumbers: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const results = [];

    for (const phone of args.phoneNumbers) {
      const formatResult = await ctx.runAction(internal.debugSms.checkPhoneNumberFormat, {
        phoneNumber: phone,
      });
      results.push(formatResult);
    }

    return {
      success: true,
      results,
      provider: "Twilio",
    };
  },
});

/**
 * Test Twilio account status
 */
export const testTwilioAccount = action({
  args: {},
  handler: async (ctx, args) => {
    try {
      const accountInfo = await ctx.runAction(internal.debugSms.checkTwilioAccount, {});

      return {
        success: true,
        accountInfo,
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