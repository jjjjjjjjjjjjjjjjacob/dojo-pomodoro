/**
 * Production SMS infrastructure with Twilio
 * Includes delivery tracking, opt-outs, and cost monitoring
 */

"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import twilio from "twilio";

/**
 * Enhanced SMS sending with production features
 */
export const sendProductionSms = internalAction({
  args: {
    phoneNumber: v.string(),
    message: v.string(),
    messageType: v.optional(v.string()), // Not used by Twilio but kept for compatibility
    senderId: v.optional(v.string()), // Not used by Twilio but kept for compatibility
    notificationId: v.optional(v.id("smsNotifications")),
    eventId: v.optional(v.id("events")), // For SMS consent checking
    clerkUserId: v.optional(v.string()), // For SMS consent checking
  },
  handler: async (ctx, args) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error("Twilio credentials not configured");
    }

    const twilioClient = twilio(accountSid, authToken);

    try {
      // Check if phone number is opted out (simplified for Twilio)
      // Note: Twilio handles opt-outs automatically, but we can check our local list
      const hashedPhone = await ctx.runAction(internal.smsMonitoringActions.hashPhoneNumber, {
        phoneNumber: args.phoneNumber,
      });
      const optOut = await ctx.runQuery(internal.smsMonitoring.checkOptOut, {
        phoneNumber: hashedPhone,
      });

      if (optOut) {
        if (args.notificationId) {
          await ctx.runMutation(internal.sms.updateNotificationStatus, {
            notificationId: args.notificationId,
            status: "failed",
            errorMessage: "Phone number is opted out",
          });
        }
        throw new Error("Phone number has opted out of SMS messages");
      }

      // Check for SMS consent if we have event and user info
      if (args.eventId && args.clerkUserId) {
        const consentResult = await ctx.runQuery(internal.rsvps.checkSmsConsentForUserEvent, {
          eventId: args.eventId,
          clerkUserId: args.clerkUserId,
        });

        if (!consentResult.hasConsented) {
          if (args.notificationId) {
            await ctx.runMutation(internal.sms.updateNotificationStatus, {
              notificationId: args.notificationId,
              status: "failed",
              errorMessage: "User has not consented to SMS for this event",
            });
          }
          throw new Error("User has not consented to SMS notifications for this event");
        }
      }

      // Send SMS via Twilio
      const message = await twilioClient.messages.create({
        body: args.message,
        from: fromNumber,
        to: args.phoneNumber,
      });

      // Update notification status
      if (args.notificationId) {
        await ctx.runMutation(internal.sms.updateNotificationStatus, {
          notificationId: args.notificationId,
          status: "sent",
          messageId: message.sid,
          sentAt: Date.now(),
        });
      }

      // Log for cost tracking
      await ctx.runAction(internal.smsMonitoringActions.logSmsUsageAction, {
        messageId: message.sid,
        phoneNumber: args.phoneNumber,
        messageLength: args.message.length,
        messageType: args.messageType || "Transactional",
        estimatedCost: calculateEstimatedCost(args.phoneNumber, args.message),
        timestamp: Date.now(),
      });

      return {
        success: true,
        messageId: message.sid,
        estimatedCost: calculateEstimatedCost(args.phoneNumber, args.message),
      };

    } catch (error: any) {
      if (args.notificationId) {
        await ctx.runMutation(internal.sms.updateNotificationStatus, {
          notificationId: args.notificationId,
          status: "failed",
          errorMessage: error.message,
        });
      }
      throw error;
    }
  },
});

/**
 * Get SMS sending statistics and costs
 */
export const getSmsStatistics = internalAction({
  args: {
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      // Get usage logs from database
      const usageLogs = await ctx.runQuery(internal.smsMonitoring.getSmsUsageLogs, {
        startDate: args.startDate,
        endDate: args.endDate,
      });

      const totalCost = usageLogs.reduce((sum, log) => sum + log.estimatedCost, 0);
      const totalMessages = usageLogs.length;

      return {
        totalMessages,
        totalCost,
        averageCostPerMessage: totalMessages > 0 ? totalCost / totalMessages : 0,
        provider: "Twilio",
        dailyBreakdown: calculateDailyBreakdown(usageLogs),
      };
    } catch (error: any) {
      throw new Error(`Failed to get SMS statistics: ${error.message}`);
    }
  },
});

/**
 * Configure SMS settings (simplified for Twilio)
 */
export const configureSmsSettings = internalAction({
  args: {
    monthlySpendLimit: v.optional(v.number()),
    defaultSenderID: v.optional(v.string()),
    deliveryStatusLogging: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Twilio doesn't have programmatic spending limits like AWS SNS
    // Instead, we can track usage in our database and alert when approaching limits

    const settings = {
      monthlySpendLimit: args.monthlySpendLimit,
      deliveryStatusLogging: args.deliveryStatusLogging ?? true,
      provider: "Twilio",
      phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    };

    return {
      success: true,
      configuredSettings: settings,
      note: "Twilio spending limits must be configured in the Twilio Console"
    };
  },
});

// Helper functions
function calculateEstimatedCost(phoneNumber: string, message: string): number {
  // Twilio US SMS pricing (as of 2024)
  const baseRate = 0.0075; // US SMS rate for Twilio
  const messageSegments = Math.ceil(message.length / 160);
  return baseRate * messageSegments;
}


function calculateDailyBreakdown(logs: any[]): Record<string, { messages: number; cost: number }> {
  const breakdown: Record<string, { messages: number; cost: number }> = {};

  logs.forEach(log => {
    const date = new Date(log.timestamp).toISOString().split('T')[0];
    if (!breakdown[date]) {
      breakdown[date] = { messages: 0, cost: 0 };
    }
    breakdown[date].messages++;
    breakdown[date].cost += log.estimatedCost;
  });

  return breakdown;
}