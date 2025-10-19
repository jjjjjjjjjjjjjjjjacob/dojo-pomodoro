/**
 * SMS mutations and queries (non-Node.js runtime)
 * Actions that require Node.js are in smsActions.ts
 */

import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

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
  async handler(ctx, args) {
    const notification = await ctx.db.insert("smsNotifications", {
      ...args,
      status: "pending",
      createdAt: Date.now(),
      messageId: undefined,
      errorMessage: undefined,
      sentAt: undefined,
    });
    return notification;
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
  async handler(ctx, args) {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      throw new Error(`Notification ${String(args.notificationId)} not found`);
    }

    const updateData: Partial<Doc<"smsNotifications">> = {
      status: args.status,
      messageId: args.messageId ?? notification.messageId,
      errorMessage: args.errorMessage ?? notification.errorMessage,
      sentAt: args.sentAt ?? notification.sentAt,
    };

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
  async handler(ctx, args) {
    const baseQuery = ctx.db
      .query("smsNotifications")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId));

    const filtered = args.type
      ? baseQuery.filter((q) => q.eq(q.field("type"), args.type))
      : baseQuery;

    return filtered
      .order("desc")
      .take(args.limit ?? 50);
    }
});

/**
 * Query to get SMS statistics for an event
 */
export const getSmsStatsByEvent = internalQuery({
  args: {
    eventId: v.id("events"),
  },
  async handler(ctx, args) {
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
  async handler(ctx, args) {
    const notification = await ctx.db
      .query("smsNotifications")
      .filter((q) => q.eq(q.field("messageId"), args.messageId))
      .first();

    if (!notification) {
      return;
    }

    const updateData: Partial<Doc<"smsNotifications">> = {
      status: args.status,
      errorMessage: args.errorMessage ?? notification.errorMessage,
    };

    await ctx.db.patch(notification._id, updateData);
  },
});