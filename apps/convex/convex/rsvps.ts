import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

export const submitRequest = mutation({
  args: {
    eventId: v.id("events"),
    listKey: v.string(),
    note: v.optional(v.string()),
    shareContact: v.boolean(),
    // Contact is optional because user may have an existing encrypted profile.
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Require authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const clerkUserId = identity.subject;

    // Ensure event exists and is active
    const ev = await ctx.db.get(args.eventId);
    if (!ev || ev.status !== "active") throw new Error("Event not available");

    // Contact encryption is handled via a Node action from the client before submit

    const now = Date.now();
    // Upsert RSVP per (eventId, clerkUserId)
    const existing = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .filter((q) => q.eq(q.field("clerkUserId"), clerkUserId))
      .unique();

    if (!existing) {
      await ctx.db.insert("rsvps", {
        eventId: args.eventId,
        clerkUserId,
        listKey: args.listKey,
        note: args.note,
        shareContact: args.shareContact,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });
    } else {
      // Prevent re-requesting the same denied list
      if (existing.status === "denied" && existing.listKey === args.listKey) {
        throw new Error("Denied for this list; try a different password");
      }
      await ctx.db.patch(existing._id, {
        listKey: args.listKey,
        note: args.note,
        shareContact: args.shareContact,
        // Reset to pending when re-requesting (unless already approved)
        status: existing.status === "approved" ? existing.status : "pending",
        updatedAt: now,
      });
    }

    return { ok: true as const };
  },
});

export const listForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }): Promise<any[]> => {
    const rows = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    const enriched = await Promise.all(
      rows.map(async (r) => {
        // Look up user's display name
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerkUserId", (q) =>
            q.eq("clerkUserId", r.clerkUserId),
          )
          .unique();
        const name = user?.name;
        // Redemption info for this user+event
        const redemption = await ctx.db
          .query("redemptions")
          .withIndex("by_event_user", (q) =>
            q.eq("eventId", eventId).eq("clerkUserId", r.clerkUserId),
          )
          .unique();
        let redemptionStatus: "none" | "issued" | "redeemed" | "disabled" =
          "none";
        if (redemption) {
          if (redemption.disabledAt) redemptionStatus = "disabled";
          else if (redemption.redeemedAt) redemptionStatus = "redeemed";
          else redemptionStatus = "issued";
        }
        let contact: { email?: string; phone?: string } | undefined;
        if (r.shareContact) {
          const prof = await ctx.runQuery(api.profiles.getForClerk, {
            clerkUserId: r.clerkUserId,
          });
          if (prof) {
            contact = {
              email: prof.emailObfuscated,
              phone: prof.phoneObfuscated,
            };
          }
        }
        return {
          id: r._id,
          clerkUserId: r.clerkUserId,
          name,
          listKey: r.listKey,
          note: r.note,
          status: r.status,
          contact,
          redemptionStatus,
          redemptionCode: redemption?.code,
          createdAt: r.createdAt,
        };
      }),
    );

    return enriched;
  },
});

export const statusForUserEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const clerkUserId = identity.subject;
    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) => q.eq(q.field("clerkUserId"), clerkUserId))
      .collect();
    if (!rsvps || rsvps.length === 0) return null;
    // Prefer approved > pending > denied; if tie, choose most recently updated
    const pick = (status: string) =>
      rsvps
        .filter((r) => r.status === status)
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
    const approved = pick("approved");
    const pending = pick("pending");
    const denied = pick("denied");
    const attending = pick("attending");
    const chosen = approved || pending || denied || attending || rsvps[0];

    // Get list credential info to check generateQR setting
    const listCredential = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) => q.eq(q.field("listKey"), chosen.listKey))
      .unique();

    return {
      listKey: chosen.listKey,
      status: chosen.status as "approved" | "pending" | "denied" | "attending",
      shareContact: chosen.shareContact,
      generateQR: listCredential?.generateQR ?? false, // default to true for backward compatibility
    } as const;
  },
});

export const statusForUserEventServer = query({
  args: { eventId: v.id("events"), clerkUserId: v.string() },
  handler: async (ctx, { eventId, clerkUserId }) => {
    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) => q.eq(q.field("clerkUserId"), clerkUserId))
      .collect();
    if (!rsvps || rsvps.length === 0) return null;
    // Prefer approved > pending > denied; if tie, choose most recently updated
    const pick = (status: string) =>
      rsvps
        .filter((r) => r.status === status)
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
    const approved = pick("approved");
    const pending = pick("pending");
    const denied = pick("denied");
    const attending = pick("attending");
    const chosen = approved || pending || denied || attending || rsvps[0];

    // Get redemption information for approved/attending users
    let redemptionInfo = null;
    if (chosen.status === "approved" || chosen.status === "attending") {
      const redemption = await ctx.db
        .query("redemptions")
        .withIndex("by_event_user", (q) =>
          q.eq("eventId", eventId).eq("clerkUserId", clerkUserId),
        )
        .unique();
      if (redemption) {
        redemptionInfo = {
          code: redemption.code,
          listKey: redemption.listKey,
          redeemedAt: redemption.redeemedAt,
          disabledAt: redemption.disabledAt,
          status: redemption.disabledAt
            ? ("disabled" as const)
            : redemption.redeemedAt
              ? ("redeemed" as const)
              : ("issued" as const),
        };
      }
    }

    return {
      listKey: chosen.listKey,
      status: chosen.status as "approved" | "pending" | "denied" | "attending",
      shareContact: chosen.shareContact,
      redemption: redemptionInfo,
    } as const;
  },
});

export const acceptRsvp = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const clerkUserId = identity.subject;

    const rsvp = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) => q.eq(q.field("clerkUserId"), clerkUserId))
      .unique();
    if (!rsvp) throw new Error("No RSVP found");

    await ctx.db.patch(rsvp._id, {
      status: "attending",
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});
