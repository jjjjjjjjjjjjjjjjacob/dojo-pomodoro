/**
 * SMS mutations and queries (non-Node.js runtime)
 * Actions that require Node.js are in smsActions.ts
 */

import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Internal mutation to create SMS notification record
 */
export const createNotification = internalMutation({
  args: {
    eventId: v.id("events"),
    recipientClerkUserId: v.string(),
    recipientPhoneObfuscated: v.string(),
    type: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("smsNotifications", {
      ...args,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

/**
 * Internal mutation to update notification status
 */
export const updateNotificationStatus = internalMutation({
  args: {
    notificationId: v.id("smsNotifications"),
    status: v.string(),
    messageId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    sentAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const updateData: any = {
      status: args.status,
    };

    if (args.messageId) updateData.messageId = args.messageId;
    if (args.errorMessage) updateData.errorMessage = args.errorMessage;
    if (args.sentAt) updateData.sentAt = args.sentAt;

    await ctx.db.patch(args.notificationId, updateData);
  },
});


/**
 * Query to get SMS notifications for an event
 * Used for analytics and debugging
 */
export const getNotificationsByEvent = internalQuery({
  args: {
    eventId: v.id("events"),
    limit: v.optional(v.number()),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("smsNotifications")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId));

    if (args.type) {
      query = query.filter((q) => q.eq(q.field("type"), args.type));
    }

    const notifications = await query
      .order("desc")
      .take(args.limit || 50);

    return notifications;
  },
});

/**
 * Query to get SMS statistics for an event
 */
export const getSmsStatsByEvent = internalQuery({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const notifications = await ctx.db
      .query("smsNotifications")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    const stats = {
      total: notifications.length,
      sent: notifications.filter((n) => n.status === "sent").length,
      failed: notifications.filter((n) => n.status === "failed").length,
      pending: notifications.filter((n) => n.status === "pending").length,
      byType: {} as Record<string, number>,
    };

    // Count by message type
    notifications.forEach((notification) => {
      stats.byType[notification.type] = (stats.byType[notification.type] || 0) + 1;
    });

    return stats;
  },
});

/**
 * Update notification status by message ID (for webhook handlers)
 */
export const updateNotificationByMessageId = internalMutation({
  args: {
    messageId: v.string(),
    status: v.string(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db
      .query("smsNotifications")
      .filter((q) => q.eq(q.field("messageId"), args.messageId))
      .first();

    if (notification) {
      const updateData: any = {
        status: args.status,
      };

      if (args.errorMessage) {
        updateData.errorMessage = args.errorMessage;
      }

      await ctx.db.patch(notification._id, updateData);
    }
  },
});