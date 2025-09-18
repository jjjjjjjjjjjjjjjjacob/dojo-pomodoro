import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

function isEmailHost(evHosts: string[], email?: string | null) {
  if (!email) return false;
  const target = email.toLowerCase();
  return evHosts.some((h) => h.toLowerCase() === target);
}

function genFallbackCode(): string {
  // Pseudo-random, URL-safe 22 chars
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  for (let i = 0; i < 22; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export const applyApproval = mutation({
  args: { rsvpId: v.id("rsvps"), code: v.optional(v.string()) },
  handler: async (ctx, { rsvpId, code }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const approverId = identity.subject;

    const rsvp = await ctx.db.get(rsvpId);
    if (!rsvp) throw new Error("RSVP not found");
    const ev = await ctx.db.get(rsvp.eventId);
    if (!ev) throw new Error("Event not found");

    // Authorization: rely on roles embedded in JWT
    const role = (identity as any).role;
    const hasHostRole = role === "org:admin";
    if (!hasHostRole) throw new Error("Forbidden: host role required");

    const now = Date.now();
    // Update RSVP status
    await ctx.db.patch(rsvpId, { status: "approved", updatedAt: now });

    // Upsert redemption
    const existingRedemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique();

    let outCode: string;
    if (!existingRedemption) {
      // Generate code (use provided or fallback)
      outCode = code || genFallbackCode();
      await ctx.db.insert("redemptions", {
        eventId: rsvp.eventId,
        clerkUserId: rsvp.clerkUserId,
        listKey: rsvp.listKey,
        code: outCode,
        createdAt: now,
        disabledAt: undefined,
        redeemedAt: undefined,
        redeemedByClerkUserId: undefined,
        unredeemHistory: [],
      });
    } else {
      outCode = existingRedemption.code;
      await ctx.db.patch(existingRedemption._id, {
        listKey: rsvp.listKey,
        disabledAt: undefined,
      });
    }

    // Record approval audit
    await ctx.db.insert("approvals", {
      eventId: rsvp.eventId,
      rsvpId,
      clerkUserId: rsvp.clerkUserId,
      listKey: rsvp.listKey,
      decision: "approved",
      decidedBy: approverId,
      decidedAt: now,
    });

    const base = process.env.APP_BASE_URL;
    const redeemUrl = base ? `${base}/redeem/${outCode}` : undefined;

    // Schedule SMS notification if contact sharing is allowed
    await ctx.scheduler.runAfter(0, api.notifications.sendApprovalSms, {
      eventId: rsvp.eventId,
      clerkUserId: rsvp.clerkUserId,
      listKey: rsvp.listKey,
      code: outCode,
      shareContact: rsvp.shareContact,
    });
    console.log("identity", identity);
    return { ok: true as const, code: outCode, redeemUrl, user: identity };
  },
});

export const approve = mutation({
  args: { rsvpId: v.id("rsvps"), reason: v.optional(v.string()) },
  handler: async (ctx, { rsvpId, reason }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const approverId = identity.subject;

    const rsvp = await ctx.db.get(rsvpId);
    if (!rsvp) throw new Error("RSVP not found");
    const ev = await ctx.db.get(rsvp.eventId);
    if (!ev) throw new Error("Event not found");

    // Authorization: rely on roles in JWT
    const role = (identity as any).role;
    const hasHostRole = role === "org:admin";
    if (!hasHostRole) throw new Error("Forbidden: host role required");

    const now = Date.now();
    await ctx.db.patch(rsvpId, { status: "approved", updatedAt: now });

    // Create a redemption if one doesn't exist
    const existingRedemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique();
    if (!existingRedemption) {
      await ctx.db.insert("redemptions", {
        eventId: rsvp.eventId,
        clerkUserId: rsvp.clerkUserId,
        listKey: rsvp.listKey,
        code: genFallbackCode(),
        createdAt: now,
        disabledAt: undefined,
        redeemedAt: undefined,
        redeemedByClerkUserId: undefined,
        unredeemHistory: [],
      });
    }

    await ctx.db.insert("approvals", {
      eventId: rsvp.eventId,
      rsvpId,
      clerkUserId: rsvp.clerkUserId,
      listKey: rsvp.listKey,
      decision: "approved",
      decidedBy: approverId,
      decidedAt: now,
      denialReason: reason,
    });

    return { ok: true as const };
  },
});

export const deny = mutation({
  args: { rsvpId: v.id("rsvps"), reason: v.optional(v.string()) },
  handler: async (ctx, { rsvpId, reason }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const approverId = identity.subject;

    const rsvp = await ctx.db.get(rsvpId);
    if (!rsvp) throw new Error("RSVP not found");
    const ev = await ctx.db.get(rsvp.eventId);
    if (!ev) throw new Error("Event not found");

    // Authorization: rely on roles in JWT
    const role = (identity as any).role;
    const hasHostRole = role === "org:admin";
    if (!hasHostRole) throw new Error("Forbidden: host role required");

    const now = Date.now();
    await ctx.db.patch(rsvpId, { status: "denied", updatedAt: now });

    // Disable redemption if exists
    const existingRedemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique();
    if (existingRedemption && !existingRedemption.disabledAt) {
      await ctx.db.patch(existingRedemption._id, { disabledAt: now });
    }

    await ctx.db.insert("approvals", {
      eventId: rsvp.eventId,
      rsvpId,
      clerkUserId: rsvp.clerkUserId,
      listKey: rsvp.listKey,
      decision: "denied",
      decidedBy: approverId,
      decidedAt: now,
      denialReason: reason,
    });

    return { ok: true as const };
  },
});
