/**
 * SMS actions that require Node.js runtime
 * Uses Twilio for sending SMS messages
 */

"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import twilio from "twilio";

/**
 * Formats a phone number to E.164 international format
 * Required for Twilio SMS sending
 */
function formatPhoneNumberForSms(phoneNumber: string): string {
  if (!phoneNumber) {
    throw new Error("Phone number is required");
  }

  // Remove all non-digits
  const digitsOnly = phoneNumber.replace(/\D/g, "");

  if (digitsOnly.length === 0) {
    throw new Error("Phone number must contain digits");
  }

  // Handle US numbers (10 digits or 11 with country code)
  if (digitsOnly.length === 10) {
    // Assume US number, add country code
    return `+1${digitsOnly}`;
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
    // US number with country code
    return `+${digitsOnly}`;
  } else if (digitsOnly.length >= 7 && digitsOnly.length <= 15) {
    // International number, ensure it has + prefix
    return `+${digitsOnly}`;
  } else {
    throw new Error("Invalid phone number length");
  }
}

/**
 * Obfuscates a phone number for display purposes
 * Shows only the last 4 digits: ***-***-1234
 */
function obfuscatePhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) return "";

  // Remove all non-digits
  const digitsOnly = phoneNumber.replace(/\D/g, "");

  if (digitsOnly.length < 4) {
    return "*".repeat(digitsOnly.length);
  }

  // Show last 4 digits with standard formatting
  const lastFour = digitsOnly.slice(-4);

  if (digitsOnly.length === 10) {
    // US format: ***-***-1234
    return `***-***-${lastFour}`;
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
    // US with country code: +1-***-***-1234
    return `+1-***-***-${lastFour}`;
  } else {
    // International format: +***...-1234
    return `+${"*".repeat(Math.max(1, digitsOnly.length - 4))}-${lastFour}`;
  }
}

/**
 * Internal action to send SMS via Twilio
 * Only callable from other Convex functions, not from client
 */
export const sendSmsInternal = internalAction({
  args: {
    phoneNumber: v.string(),
    message: v.string(),
    notificationId: v.optional(v.id("smsNotifications")),
  },
  handler: async (ctx, args) => {
    // Validate environment variables
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error("Twilio credentials not configured");
    }

    // Create Twilio client
    const twilioClient = twilio(accountSid, authToken);

    try {
      // Format phone number for international format
      const formattedPhone = formatPhoneNumberForSms(args.phoneNumber);

      // Send SMS via Twilio
      const message = await twilioClient.messages.create({
        body: args.message,
        from: fromNumber,
        to: formattedPhone,
      });

      // Update notification status if ID provided
      if (args.notificationId) {
        await ctx.runMutation(internal.sms.updateNotificationStatus, {
          notificationId: args.notificationId,
          status: "sent",
          messageId: message.sid,
          sentAt: Date.now(),
        });
      }

      return {
        success: true,
        messageId: message.sid,
        phone: obfuscatePhoneNumber(formattedPhone),
      };
    } catch (error: any) {
      // Update notification status with error if ID provided
      if (args.notificationId) {
        await ctx.runMutation(internal.sms.updateNotificationStatus, {
          notificationId: args.notificationId,
          status: "failed",
          errorMessage: error.message,
        });
      }

      throw new Error(`SMS send failed: ${error.message}`);
    }
  },
});

/**
 * Internal action to send bulk SMS messages
 * Processes in batches to avoid overwhelming Twilio
 */
export const sendBulkSmsInternal = internalAction({
  args: {
    recipients: v.array(
      v.object({
        phoneNumber: v.string(),
        clerkUserId: v.string(),
        notificationId: v.optional(v.id("smsNotifications")),
      })
    ),
    message: v.string(),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize || 10; // Process 10 SMS at a time
    const results = [];

    // Process recipients in batches
    for (let i = 0; i < args.recipients.length; i += batchSize) {
      const batch = args.recipients.slice(i, i + batchSize);

      // Send batch of SMS messages
      const batchResults = await Promise.allSettled(
        batch.map((recipient) =>
          ctx.runAction(internal.smsActions.sendSmsInternal, {
            phoneNumber: recipient.phoneNumber,
            message: args.message,
            notificationId: recipient.notificationId,
          })
        )
      );

      // Collect results
      batchResults.forEach((result, index) => {
        const recipient = batch[index];
        if (result.status === "fulfilled") {
          results.push({
            clerkUserId: recipient.clerkUserId,
            success: true,
            messageId: result.value.messageId,
          });
        } else {
          results.push({
            clerkUserId: recipient.clerkUserId,
            success: false,
            error: result.reason?.message || "Unknown error",
          });
        }
      });

      // Small delay between batches to be respectful to Twilio
      if (i + batchSize < args.recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Calculate success/failure counts
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    return {
      totalRecipients: args.recipients.length,
      successCount,
      failureCount,
      results,
    };
  },
});