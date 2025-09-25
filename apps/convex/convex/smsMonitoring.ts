/**
 * SMS monitoring and cost tracking
 */

import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Log SMS usage for cost tracking with Twilio (accepts pre-hashed phone)
 */
export const logSmsUsage = internalMutation({
  args: {
    messageId: v.string(),
    hashedPhoneNumber: v.string(),
    messageLength: v.number(),
    messageType: v.string(),
    estimatedCost: v.number(),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("smsUsageLogs", {
      messageId: args.messageId,
      phoneNumber: args.hashedPhoneNumber,
      messageLength: args.messageLength,
      messageType: args.messageType,
      estimatedCost: args.estimatedCost,
      timestamp: args.timestamp,
    });
  },
});

/**
 * Get SMS usage logs for analytics
 */
export const getSmsUsageLogs = internalQuery({
  args: {
    startDate: v.number(),
    endDate: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("smsUsageLogs")
      .withIndex("by_timestamp", (q) =>
        q.gte("timestamp", args.startDate).lte("timestamp", args.endDate)
      )
      .take(args.limit || 1000);

    return logs;
  },
});

/**
 * Get SMS cost summary
 */
export const getSmsCostSummary = internalQuery({
  args: {
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("smsUsageLogs")
      .withIndex("by_timestamp", (q) =>
        q.gte("timestamp", args.startDate).lte("timestamp", args.endDate)
      )
      .collect();

    const summary = {
      totalMessages: logs.length,
      totalCost: logs.reduce((sum, log) => sum + log.estimatedCost, 0),
      averageCostPerMessage: 0,
      messagesByType: {} as Record<string, number>,
      costByType: {} as Record<string, number>,
    };

    if (summary.totalMessages > 0) {
      summary.averageCostPerMessage = summary.totalCost / summary.totalMessages;
    }

    logs.forEach((log) => {
      summary.messagesByType[log.messageType] =
        (summary.messagesByType[log.messageType] || 0) + 1;
      summary.costByType[log.messageType] =
        (summary.costByType[log.messageType] || 0) + log.estimatedCost;
    });

    return summary;
  },
});

/**
 * Handle SMS opt-outs (internal mutation that accepts hashed phone)
 */
export const recordOptOutMutation = internalMutation({
  args: {
    hashedPhone: v.string(),
    clerkUserId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("smsOptOuts", {
      phoneNumber: args.hashedPhone,
      clerkUserId: args.clerkUserId,
      optedOutAt: Date.now(),
      reason: args.reason || "user_request",
    });
  },
});

/**
 * Check if a phone number has opted out
 */
export const checkOptOut = internalQuery({
  args: {
    phoneNumber: v.string(), // Should be hashed
  },
  handler: async (ctx, args) => {
    const optOut = await ctx.db
      .query("smsOptOuts")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();

    return optOut !== null;
  },
});

/**
 * Remove a phone number from opt-out list (internal mutation that accepts hashed phone)
 */
export const removeOptOutMutation = internalMutation({
  args: {
    hashedPhone: v.string(),
  },
  handler: async (ctx, args) => {
    const optOut = await ctx.db
      .query("smsOptOuts")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.hashedPhone))
      .first();

    if (optOut) {
      await ctx.db.delete(optOut._id);
    }
  },
});

/**
 * Update delivery status for SMS usage logs
 */
export const updateDeliveryStatus = internalMutation({
  args: {
    messageId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const log = await ctx.db
      .query("smsUsageLogs")
      .filter((q) => q.eq(q.field("messageId"), args.messageId))
      .first();

    if (log) {
      await ctx.db.patch(log._id, {
        status: args.status,
      });
    }
  },
});