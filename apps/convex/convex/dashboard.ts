import { query } from "./_generated/server";
import { v } from "convex/values";

export const getDashboardStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    // Get all events for the organization
    const events = await ctx.db.query("events").collect();

    // Get all RSVPs
    const rsvps = await ctx.db.query("rsvps").collect();

    // Calculate stats
    const totalEvents = events.length;
    const totalRsvps = rsvps.length;

    // Approval rates
    const approvedRsvps = rsvps.filter(
      (rsvp) => rsvp.status === "approved",
    ).length;
    const pendingRsvps = rsvps.filter(
      (rsvp) => rsvp.status === "pending",
    ).length;
    const deniedRsvps = rsvps.filter((rsvp) => rsvp.status === "denied").length;

    const approvalRate =
      totalRsvps > 0 ? (approvedRsvps / totalRsvps) * 100 : 0;

    // Redemption rates
    const redeemedTickets = rsvps.filter(
      (rsvp) => rsvp.status === "redeemed",
    ).length;
    const issuedTickets = rsvps.filter(
      (rsvp) => rsvp.status === "issued",
    ).length;
    const totalActiveTickets = redeemedTickets + issuedTickets;
    const redemptionRate =
      totalActiveTickets > 0 ? (redeemedTickets / totalActiveTickets) * 100 : 0;

    // Calculate trends (simple month-over-month comparison)
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000;

    const recentRsvps = rsvps.filter(
      (rsvp) => (rsvp._creationTime || 0) > thirtyDaysAgo,
    ).length;
    const previousMonthRsvps = rsvps.filter(
      (rsvp) =>
        (rsvp._creationTime || 0) > sixtyDaysAgo &&
        (rsvp._creationTime || 0) <= thirtyDaysAgo,
    ).length;

    const rsvpTrend =
      previousMonthRsvps > 0
        ? ((recentRsvps - previousMonthRsvps) / previousMonthRsvps) * 100
        : recentRsvps > 0
          ? 100
          : 0;

    return {
      totalEvents,
      totalRsvps,
      approvedRsvps,
      pendingRsvps,
      deniedRsvps,
      approvalRate: Math.round(approvalRate * 10) / 10,
      redemptionRate: Math.round(redemptionRate * 10) / 10,
      rsvpTrend: Math.round(rsvpTrend * 10) / 10,
      recentRsvps,
      redeemedTickets,
      issuedTickets,
    };
  },
});

export const getRsvpTrends = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const rsvps = await ctx.db.query("rsvps").collect();

    // Group RSVPs by day for the last 30 days
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const dailyData: Record<string, number> = {};

    // Initialize all days with 0
    for (let i = 0; i < 30; i++) {
      const date = new Date(now - i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split("T")[0];
      dailyData[dateKey] = 0;
    }

    // Count RSVPs by day
    rsvps
      .filter((rsvp) => (rsvp._creationTime || 0) > thirtyDaysAgo)
      .forEach((rsvp) => {
        const date = new Date(rsvp._creationTime || 0);
        const dateKey = date.toISOString().split("T")[0];
        if (dailyData[dateKey] !== undefined) {
          dailyData[dateKey]++;
        }
      });

    // Convert to array format for charts
    const trends = Object.entries(dailyData)
      .map(([date, count]) => ({
        date,
        rsvps: count,
        formattedDate: new Date(date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return trends;
  },
});

export const getEventPerformance = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const events = await ctx.db.query("events").collect();

    const rsvps = await ctx.db.query("rsvps").collect();

    // Get performance data for each event
    const eventPerformance = events
      .map((event) => {
        const eventRsvps = rsvps.filter((rsvp) => rsvp.eventId === event._id);
        const approvedRsvps = eventRsvps.filter(
          (rsvp) => rsvp.status === "approved",
        );
        const redeemedTickets = eventRsvps.filter(
          (rsvp) => rsvp.status === "redeemed",
        );

        return {
          eventId: event._id,
          eventName: event.name || "Untitled Event",
          totalRsvps: eventRsvps.length,
          approvedRsvps: approvedRsvps.length,
          redeemedTickets: redeemedTickets.length,
          eventDate: event.eventDate,
        };
      })
      .sort((a, b) => (b.eventDate || 0) - (a.eventDate || 0))
      .slice(0, 10); // Top 10 most recent events

    return eventPerformance;
  },
});

export const getRecentActivity = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    // Get recent RSVPs (last 7 days)
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const recentRsvps = await ctx.db
      .query("rsvps")
      .filter((q) => q.gte(q.field("_creationTime"), sevenDaysAgo))
      .order("desc")
      .take(10);

    // Get event details and user names for these RSVPs
    const eventsMap = new Map();
    const usersMap = new Map();

    for (const rsvp of recentRsvps) {
      // Cache events
      if (!eventsMap.has(rsvp.eventId)) {
        const event = await ctx.db.get(rsvp.eventId);
        if (event) {
          eventsMap.set(rsvp.eventId, event);
        }
      }

      // Cache users
      if (!usersMap.has(rsvp.clerkUserId)) {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", rsvp.clerkUserId))
          .unique();
        if (user) {
          usersMap.set(rsvp.clerkUserId, user);
        }
      }
    }

    const activityData = recentRsvps.map((rsvp) => {
      const event = eventsMap.get(rsvp.eventId);
      const user = usersMap.get(rsvp.clerkUserId);

      // Get guest name from firstName + lastName, fallback to name, then to "Unknown Guest"
      let guestName = "Unknown Guest";
      if (user) {
        const displayName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        guestName = displayName || user.name || "Unknown Guest";
      }

      return {
        id: rsvp._id,
        guestName,
        eventName: event?.name || "Unknown Event",
        status: rsvp.status,
        createdAt: rsvp._creationTime,
        type: "rsvp" as const,
      };
    });

    return activityData;
  },
});

