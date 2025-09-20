import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function hasJwtDoorOrHost(identity: any) {
  const role = identity?.role as string | null | undefined;
  return role === "org:member" || role === "org:admin";
}

export const byCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalizedCode = code.toUpperCase();
    const rec = await ctx.db
      .query("redemptions")
      .withIndex("by_code", (q) => q.eq("code", normalizedCode))
      .unique();
    if (!rec) return { status: "invalid" as const };

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", rec.clerkUserId))
      .unique();
    const name = user?.name ?? undefined;

    if (rec.disabledAt) return { status: "invalid" as const };
    if (rec.redeemedAt)
      return { status: "redeemed" as const, name, listKey: rec.listKey };
    return { status: "valid" as const, name, listKey: rec.listKey };
  },
});

export const validate = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalizedCode = code.toUpperCase();
    const rec = await ctx.db
      .query("redemptions")
      .withIndex("by_code", (q) => q.eq("code", normalizedCode))
      .unique();
    if (!rec) return { status: "invalid" as const };

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", rec.clerkUserId))
      .unique();
    const name = user?.name ?? undefined;

    if (rec.disabledAt) return { status: "invalid" as const };
    if (rec.redeemedAt)
      return { status: "redeemed" as const, name, listKey: rec.listKey };
    return { status: "valid" as const, name, listKey: rec.listKey };
  },
});

export const redeem = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const redeemerId = identity.subject;
    if (!hasJwtDoorOrHost(identity))
      throw new Error("Forbidden: door/host role required");

    const normalizedCode = code.toUpperCase();
    const rec = await ctx.db
      .query("redemptions")
      .withIndex("by_code", (q) => q.eq("code", normalizedCode))
      .unique();
    if (!rec) throw new Error("Invalid code");
    if (rec.disabledAt) throw new Error("Invalid code");
    if (rec.redeemedAt) return { status: "already" as const };

    await ctx.db.patch(rec._id, {
      redeemedAt: Date.now(),
      redeemedByClerkUserId: redeemerId,
    });
    return { status: "ok" as const };
  },
});

export const unredeem = mutation({
  args: { code: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, { code, reason }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const redeemerId = identity.subject;
    if (!hasJwtDoorOrHost(identity))
      throw new Error("Forbidden: door/host role required");

    const normalizedCode = code.toUpperCase();
    const rec = await ctx.db
      .query("redemptions")
      .withIndex("by_code", (q) => q.eq("code", normalizedCode))
      .unique();
    if (!rec) throw new Error("Invalid code");

    const hist = rec.unredeemHistory ?? [];
    hist.push({ at: Date.now(), byClerkUserId: redeemerId, reason });
    await ctx.db.patch(rec._id, {
      redeemedAt: undefined,
      redeemedByClerkUserId: undefined,
      unredeemHistory: hist,
    });
    return { status: "ok" as const };
  },
});

export const listForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const rows = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) => q.eq("eventId", eventId))
      .collect();
    return rows.map((r) => ({
      clerkUserId: r.clerkUserId,
      listKey: r.listKey,
      code: r.code,
      redeemedAt: r.redeemedAt,
      disabledAt: r.disabledAt,
    }));
  },
});

export const forCurrentUserEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Query user document first to establish reactive dependency
    // This ensures the query re-runs when user document becomes available
    const userDocument = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    const redemptionRecord = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) => {
        return q.eq("eventId", eventId).eq("clerkUserId", identity.subject);
      })
      .unique();
    if (!redemptionRecord) return null;
    return { code: redemptionRecord.code, listKey: redemptionRecord.listKey };
  },
});

export const getRedemptionByRsvpId = query({
  args: { rsvpId: v.id("rsvps") },
  handler: async (ctx, { rsvpId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    if (!hasJwtDoorOrHost(identity))
      throw new Error("Forbidden: door/host role required");

    const rsvpRecord = await ctx.db.get(rsvpId);
    if (!rsvpRecord) return null;

    const redemptionRecord = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q
          .eq("eventId", rsvpRecord.eventId)
          .eq("clerkUserId", rsvpRecord.clerkUserId),
      )
      .unique();

    if (!redemptionRecord) return null;

    return {
      code: redemptionRecord.code,
      listKey: redemptionRecord.listKey,
      redeemedAt: redemptionRecord.redeemedAt,
      disabledAt: redemptionRecord.disabledAt,
      status: redemptionRecord.disabledAt
        ? ("disabled" as const)
        : redemptionRecord.redeemedAt
          ? ("redeemed" as const)
          : ("issued" as const),
    };
  },
});

export const toggleRedemptionStatus = mutation({
  args: { rsvpId: v.id("rsvps") },
  handler: async (ctx, { rsvpId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    if (!hasJwtDoorOrHost(identity))
      throw new Error("Forbidden: door/host role required");

    const rsvpRecord = await ctx.db.get(rsvpId);
    if (!rsvpRecord) throw new Error("RSVP not found");

    const redemptionRecord = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q
          .eq("eventId", rsvpRecord.eventId)
          .eq("clerkUserId", rsvpRecord.clerkUserId),
      )
      .unique();

    if (!redemptionRecord) throw new Error("Redemption not found");

    if (redemptionRecord.redeemedAt) {
      throw new Error("Cannot toggle status for already redeemed code");
    }

    const currentlyDisabled = !!redemptionRecord.disabledAt;
    await ctx.db.patch(redemptionRecord._id, {
      disabledAt: currentlyDisabled ? undefined : Date.now(),
    });

    return {
      status: currentlyDisabled ? ("enabled" as const) : ("disabled" as const),
    };
  },
});

// Generate a random redemption code
function generateRedemptionCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Seed helper mutation - creates a redemption code for an RSVP
export const createForRSVP = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    eventId: v.id("events"),
    clerkUserId: v.string(),
    listKey: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if redemption already exists
    const existing = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", args.eventId).eq("clerkUserId", args.clerkUserId)
      )
      .unique();

    if (existing) {
      return existing._id;
    }

    // Generate unique code
    let code: string;
    let attempts = 0;
    do {
      code = generateRedemptionCode();
      const existing = await ctx.db
        .query("redemptions")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique();
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      throw new Error("Could not generate unique redemption code");
    }

    const redemptionId = await ctx.db.insert("redemptions", {
      eventId: args.eventId,
      clerkUserId: args.clerkUserId,
      listKey: args.listKey,
      code,
      createdAt: Date.now(),
      unredeemHistory: [],
    });

    return redemptionId;
  },
});

// Delete a redemption (for cleaning up test data)
export const deleteForRSVP = mutation({
  args: {
    rsvpId: v.id("rsvps"),
  },
  handler: async (ctx, args) => {
    const rsvp = await ctx.db.get(args.rsvpId);
    if (!rsvp) return { deleted: false };

    const redemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId)
      )
      .unique();

    if (redemption) {
      await ctx.db.delete(redemption._id);
      return { deleted: true };
    }
    return { deleted: false };
  },
});
