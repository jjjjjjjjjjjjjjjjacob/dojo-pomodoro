/**
 * SMS actions that require Node.js runtime
 * Uses Twilio for sending SMS messages
 */

"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import twilio from "twilio";
import { formatPhoneNumberForSms, obfuscatePhoneNumber } from "./lib/phoneUtils";

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
    const results: Array<{
      clerkUserId: string;
      success: boolean;
      messageId?: string;
      error?: string;
    }> = [];

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
          const errorMessage =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason ?? "Unknown error");
          results.push({
            clerkUserId: recipient.clerkUserId,
            success: false,
            error: errorMessage,
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

/**
 * Send automated help response via Twilio when users text HELP
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