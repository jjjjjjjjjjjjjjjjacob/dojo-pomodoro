/**
 * Debug SMS functionality to check Twilio delivery
 */

"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import twilio from "twilio";

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

export const checkPhoneNumberFormat = action({
  args: {
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const digitsOnly = args.phoneNumber.replace(/\D/g, "");

    let formattedOptions = [];

    // Show different formatting options
    if (digitsOnly.length === 10) {
      formattedOptions.push(`+1${digitsOnly}`);
      formattedOptions.push(`1${digitsOnly}`);
    }

    if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
      formattedOptions.push(`+${digitsOnly}`);
    }

    if (!args.phoneNumber.startsWith("+")) {
      formattedOptions.push(`+${digitsOnly}`);
    }

    return {
      original: args.phoneNumber,
      digitsOnly,
      length: digitsOnly.length,
      formattedOptions,
      recommended: digitsOnly.length === 10 ? `+1${digitsOnly}` : `+${digitsOnly}`,
      provider: "Twilio",
    };
  },
});

/**
 * Check Twilio account balance and limits
 */
export const checkTwilioAccount = action({
  args: {},
  handler: async (ctx, args) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      return { error: "Twilio credentials not configured" };
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
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        code: error.code || error.status,
      };
    }
  },
});