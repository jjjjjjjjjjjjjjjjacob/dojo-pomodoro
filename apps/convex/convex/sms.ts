/**
 * SMS mutations and queries (non-Node.js runtime)
 * Actions that require Node.js are in smsActions.ts
 */

import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

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

type PaginatedSmsNotificationResult = {
  page: Array<Doc<"smsNotifications"> & { recipientName?: string; eventName?: string }>;
  nextCursor: string | null;
  isDone: boolean;
};

/**
 * Query to get paginated SMS notifications for an event
 */
export const listForEventPaginated = query({
  args: {
    eventId: v.optional(v.id("events")),
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
    statusFilter: v.optional(v.string()),
    typeFilter: v.optional(v.string()),
    phoneSearch: v.optional(v.string()),
  },
  async handler(
    ctx,
    {
      eventId,
      cursor,
      pageSize = 20,
      statusFilter = "all",
      typeFilter = "all",
      phoneSearch = "",
    },
  ): Promise<PaginatedSmsNotificationResult> {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    // Build query with index if eventId provided
    let baseQuery = eventId
      ? ctx.db.query("smsNotifications").withIndex("by_event", (q) =>
          q.eq("eventId", eventId),
        )
      : ctx.db.query("smsNotifications");

    // Apply filters
    if (statusFilter !== "all") {
      baseQuery = baseQuery.filter((q) =>
        q.eq(q.field("status"), statusFilter),
      );
    }

    if (typeFilter !== "all") {
      baseQuery = baseQuery.filter((q) => q.eq(q.field("type"), typeFilter));
    }

    if (phoneSearch.trim()) {
      baseQuery = baseQuery.filter((q) =>
        q.eq(q.field("recipientPhoneObfuscated"), phoneSearch.trim()),
      );
    }

    // Paginate
    const paginatedResult = await baseQuery.order("desc").paginate({
      cursor: cursor ?? null,
      numItems: pageSize,
    });

    // Batch fetch related data
    const eventIds = new Set<string>();
    const userIds = new Set<string>();

    paginatedResult.page.forEach((notification) => {
      eventIds.add(notification.eventId);
      userIds.add(notification.recipientClerkUserId);
    });

    // Fetch events
    const eventsMap = new Map();
    for (const eventIdValue of eventIds) {
      const event = await ctx.db.get(eventIdValue as Id<"events">);
      if (event) {
        eventsMap.set(eventIdValue, event);
      }
    }

    // Fetch users
    const usersMap = new Map();
    for (const userId of userIds) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", userId))
        .unique();
      if (user) {
        usersMap.set(userId, user);
      }
    }

    // Enrich notifications with related data
    const enrichedPage = paginatedResult.page.map((notification) => {
      const event = eventsMap.get(notification.eventId);
      const user = usersMap.get(notification.recipientClerkUserId);

      let recipientName = "Unknown";
      if (user) {
        const displayName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
        recipientName = displayName || user.name || "Unknown";
      }

      return {
        ...notification,
        recipientName,
        eventName: event?.name || "Unknown Event",
      };
    });

    return {
      page: enrichedPage,
      nextCursor: paginatedResult.continueCursor,
      isDone: paginatedResult.isDone,
    };
  },
});

/**
 * Count SMS notifications for an event with filters
 */
export const countForEventFiltered = query({
  args: {
    eventId: v.optional(v.id("events")),
    statusFilter: v.optional(v.string()),
    typeFilter: v.optional(v.string()),
    phoneSearch: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    // Build query with index if eventId provided
    let baseQuery = args.eventId
      ? ctx.db.query("smsNotifications").withIndex("by_event", (q) =>
          q.eq("eventId", args.eventId!),
        )
      : ctx.db.query("smsNotifications");

    if (args.statusFilter && args.statusFilter !== "all") {
      baseQuery = baseQuery.filter((q) =>
        q.eq(q.field("status"), args.statusFilter),
      );
    }

    if (args.typeFilter && args.typeFilter !== "all") {
      baseQuery = baseQuery.filter((q) =>
        q.eq(q.field("type"), args.typeFilter),
      );
    }

    if (args.phoneSearch && args.phoneSearch.trim()) {
      baseQuery = baseQuery.filter((q) =>
        q.eq(q.field("recipientPhoneObfuscated"), args.phoneSearch!.trim()),
      );
    }

    const notifications = await baseQuery.collect();
    return notifications.length;
  },
});