import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

export const submitRequest = mutation({
  args: {
    eventId: v.id("events"),
    listKey: v.string(),
    note: v.optional(v.string()),
    shareContact: v.boolean(),
    attendees: v.optional(v.number()),
    // Contact is optional because user may have an existing encrypted profile.
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Require authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const clerkUserId = identity.subject;

    // Ensure event exists and is upcoming
    const event = await ctx.db.get(args.eventId);
    const now = Date.now();
    if (!event || event.eventDate <= now)
      throw new Error("Event not available");

    // Validate attendees against event's maxAttendees setting
    const maxAttendeesAllowed = event.maxAttendees ?? 1;
    const requestedAttendees = args.attendees ?? 1;
    if (requestedAttendees > maxAttendeesAllowed) {
      throw new Error(
        `Maximum ${maxAttendeesAllowed} attendees allowed for this event`,
      );
    }
    if (requestedAttendees < 1) {
      throw new Error("At least 1 attendee required");
    }

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
        attendees: requestedAttendees,
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
        attendees: requestedAttendees,
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
        const firstName = user?.firstName;
        const lastName = user?.lastName;
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
          firstName,
          lastName,
          listKey: r.listKey,
          note: r.note,
          status: r.status,
          attendees: r.attendees,
          contact,
          metadata: user?.metadata,
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

export const listUserTickets = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const clerkUserId = identity.subject;

    // Get all RSVPs for the user
    const userRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
      .collect();

    // Get event details and redemption codes for each RSVP
    const ticketsWithDetails = await Promise.all(
      userRsvps.map(async (rsvp) => {
        const event = await ctx.db.get(rsvp.eventId);

        // Get redemption code if user is approved/attending
        let redemptionInfo = null;
        if (rsvp.status === "approved" || rsvp.status === "attending") {
          const redemption = await ctx.db
            .query("redemptions")
            .withIndex("by_event_user", (q) =>
              q.eq("eventId", rsvp.eventId).eq("clerkUserId", clerkUserId),
            )
            .unique();

          if (redemption) {
            redemptionInfo = {
              code: redemption.code,
              listKey: redemption.listKey,
              redeemedAt: redemption.redeemedAt,
            };
          }
        }

        return {
          rsvp,
          event,
          redemption: redemptionInfo,
        };
      }),
    );

    // Sort by event date (newest first)
    return ticketsWithDetails.sort((a, b) => {
      if (!a.event || !b.event) return 0;
      return b.event.eventDate - a.event.eventDate;
    });
  },
});

// Seed helper mutation - creates an RSVP with any status (for testing)
export const createDirect = mutation({
  args: {
    eventId: v.id("events"),
    clerkUserId: v.string(),
    listKey: v.string(),
    shareContact: v.boolean(),
    note: v.optional(v.string()),
    attendees: v.optional(v.number()),
    status: v.string(),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.createdAt || Date.now();
    const rsvpId = await ctx.db.insert("rsvps", {
      eventId: args.eventId,
      clerkUserId: args.clerkUserId,
      listKey: args.listKey,
      note: args.note,
      shareContact: args.shareContact,
      attendees: args.attendees,
      status: args.status,
      createdAt: now,
      updatedAt: now,
    });
    return rsvpId;
  },
});

// Delete an RSVP (for cleaning up test data)
export const deleteRSVP = mutation({
  args: {
    rsvpId: v.id("rsvps"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.rsvpId);
    return { deleted: true };
  },
});

// Complete RSVP update with approval and ticket status
export const updateRsvpComplete = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    approvalStatus: v.optional(
      v.union(v.literal("pending"), v.literal("approved"), v.literal("denied")),
    ),
    ticketStatus: v.optional(
      v.union(
        v.literal("issued"),
        v.literal("not-issued"),
        v.literal("disabled"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const role = (identity as any).role;
    const hasAdminRole = role === "org:admin";
    if (!hasAdminRole) throw new Error("Forbidden: admin role required");

    const rsvp = await ctx.db.get(args.rsvpId);
    if (!rsvp) throw new Error("RSVP not found");

    const now = Date.now();

    // Update approval status if provided
    if (args.approvalStatus && args.approvalStatus !== rsvp.status) {
      await ctx.db.patch(args.rsvpId, {
        status: args.approvalStatus,
        updatedAt: now,
      });

      // Handle redemption based on approval status
      if (args.approvalStatus === "approved") {
        // Auto-create redemption when approving
        await ctx.runMutation(api.redemptions.updateTicketStatus, {
          rsvpId: args.rsvpId,
          status: "issued",
        });
      } else if (args.approvalStatus === "denied") {
        // Auto-disable redemption when denying
        const existingRedemption = await ctx.db
          .query("redemptions")
          .withIndex("by_event_user", (q) =>
            q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
          )
          .unique();
        if (existingRedemption && !existingRedemption.disabledAt) {
          await ctx.db.patch(existingRedemption._id, { disabledAt: now });
        }
      }

      // Record approval audit
      await ctx.db.insert("approvals", {
        eventId: rsvp.eventId,
        rsvpId: args.rsvpId,
        clerkUserId: rsvp.clerkUserId,
        listKey: rsvp.listKey,
        decision: args.approvalStatus,
        decidedBy: identity.subject,
        decidedAt: now,
      });
    }

    // Update ticket status if provided and not overridden by approval logic
    if (args.ticketStatus && args.approvalStatus !== "denied") {
      await ctx.runMutation(api.redemptions.updateTicketStatus, {
        rsvpId: args.rsvpId,
        status: args.ticketStatus,
      });
    }

    return { status: "ok" as const };
  },
});

// Complete RSVP deletion with all associated records
export const deleteRsvpComplete = mutation({
  args: {
    rsvpId: v.id("rsvps"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const role = (identity as any).role;
    const hasAdminRole = role === "org:admin";
    if (!hasAdminRole) throw new Error("Forbidden: admin role required");

    const rsvp = await ctx.db.get(args.rsvpId);
    if (!rsvp) throw new Error("RSVP not found");

    // Delete associated redemption
    const redemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique();
    if (redemption) {
      await ctx.db.delete(redemption._id);
    }

    // Delete associated approvals
    const approvals = await ctx.db
      .query("approvals")
      .filter((q) => q.eq(q.field("rsvpId"), args.rsvpId))
      .collect();
    for (const approval of approvals) {
      await ctx.db.delete(approval._id);
    }

    // Delete the RSVP itself
    await ctx.db.delete(args.rsvpId);

    return { deleted: true };
  },
});

// Update RSVP list key only
export const updateRsvpListKey = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    listKey: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const role = (identity as any).role;
    const hasAdminRole = role === "org:admin";
    if (!hasAdminRole) throw new Error("Forbidden: admin role required");

    const rsvp = await ctx.db.get(args.rsvpId);
    if (!rsvp) throw new Error("RSVP not found");

    await ctx.db.patch(args.rsvpId, {
      listKey: args.listKey,
    });

    // Update related records with the new list key
    // Update redemption record if it exists
    const redemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique();
    if (redemption) {
      await ctx.db.patch(redemption._id, {
        listKey: args.listKey,
      });
    }

    // Update approval records if they exist
    const approvals = await ctx.db
      .query("approvals")
      .filter((q) => q.eq(q.field("rsvpId"), args.rsvpId))
      .collect();
    for (const approval of approvals) {
      await ctx.db.patch(approval._id, {
        listKey: args.listKey,
      });
    }

    return { status: "ok" as const };
  },
});
