import { mutation, query } from "./functions";
import { v } from "convex/values";
import { EventPatch, ValidationError, NotFoundError } from "./lib/types";
import { internal } from "./_generated/api";
import type { UserIdentity } from "convex/server";

type UserIdentityWithRole = UserIdentity & {
  role?: string;
};
// Node crypto-based creation is handled in eventsNode.ts (action).
// This module contains only queries/mutations compatible with the standard runtime.

export const insertWithCreds = mutation({
  args: {
    name: v.string(),
    secondaryTitle: v.optional(v.string()),
    hosts: v.array(v.string()),
    location: v.string(),
    flyerUrl: v.optional(v.string()),
    flyerStorageId: v.optional(v.id("_storage")),
    eventDate: v.number(),
    eventTimezone: v.optional(v.string()),
    maxAttendees: v.optional(v.number()),
    customFields: v.optional(
      v.array(
        v.object({
          key: v.string(),
          label: v.string(),
          placeholder: v.optional(v.string()),
          required: v.optional(v.boolean()),
          copyEnabled: v.optional(v.boolean()),
          prependUrl: v.optional(v.string()),
          trimWhitespace: v.optional(v.boolean()),
        }),
      ),
    ),
    themeBackgroundColor: v.optional(v.string()),
    themeTextColor: v.optional(v.string()),
    creds: v.array(
      v.object({
        listKey: v.string(),
        passwordHash: v.string(),
        passwordSalt: v.string(),
        passwordIterations: v.number(),
        passwordFingerprint: v.string(),
        generateQR: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.eventDate < now)
      throw new Error("Event date must be in the future");
    const eventId = await ctx.db.insert("events", {
      name: args.name,
      secondaryTitle: args.secondaryTitle,
      hosts: args.hosts,
      location: args.location,
      flyerUrl: args.flyerUrl,
      flyerStorageId: args.flyerStorageId,
      eventDate: args.eventDate,
      eventTimezone: args.eventTimezone,
      maxAttendees: args.maxAttendees,
      customFields: args.customFields,
      themeBackgroundColor: args.themeBackgroundColor,
      themeTextColor: args.themeTextColor,
      createdAt: now,
      updatedAt: now,
    });
    for (const credential of args.creds) {
      await ctx.db.insert("listCredentials", {
        eventId,
        ...credential,
        createdAt: now,
      });
    }
    return { eventId };
  },
});

export const update = mutation({
  args: {
    eventId: v.id("events"),
    name: v.optional(v.string()),
    secondaryTitle: v.optional(v.string()),
    hosts: v.optional(v.array(v.string())),
    location: v.optional(v.string()),
    flyerUrl: v.optional(v.string()),
    flyerStorageId: v.optional(v.id("_storage")),
    eventDate: v.optional(v.number()),
    eventTimezone: v.optional(v.string()),
    maxAttendees: v.optional(v.number()),
    isFeatured: v.optional(v.boolean()),
    customFields: v.optional(
      v.array(
        v.object({
          key: v.string(),
          label: v.string(),
          placeholder: v.optional(v.string()),
          required: v.optional(v.boolean()),
          copyEnabled: v.optional(v.boolean()),
          prependUrl: v.optional(v.string()),
          trimWhitespace: v.optional(v.boolean()),
        }),
      ),
    ),
    themeBackgroundColor: v.optional(v.string()),
    themeTextColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new NotFoundError("Event");

    const patch: EventPatch & { updatedAt: number } = { updatedAt: Date.now() };
    const updateableFields = [
      "name",
      "secondaryTitle",
      "hosts",
      "location",
      "flyerUrl",
      "flyerStorageId",
      "eventDate",
      "eventTimezone",
      "maxAttendees",
      "isFeatured",
      "customFields",
      "themeBackgroundColor",
      "themeTextColor",
    ] as const;

    for (const fieldKey of updateableFields) {
      if (args[fieldKey] !== undefined) {
        (patch as Record<string, unknown>)[fieldKey] = args[fieldKey];
      }
    }
    await ctx.db.patch(args.eventId, patch);
    return { ok: true };
  },
});

export const remove = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    // Authorization check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const userRole = (identity as UserIdentityWithRole).role;
    const hasAdminRole = userRole === "org:admin";
    if (!hasAdminRole) throw new Error("Forbidden: admin role required");

    // Simply delete the event - trigger handles all cascading automatically!
    await ctx.db.delete(eventId);

    return { ok: true };
  },
});

export const addListCredential = mutation({
  args: {
    eventId: v.id("events"),
    listKey: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
    passwordIterations: v.number(),
    passwordFingerprint: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("listCredentials", {
      eventId: args.eventId,
      listKey: args.listKey,
      passwordHash: args.passwordHash,
      passwordSalt: args.passwordSalt,
      passwordIterations: args.passwordIterations,
      passwordFingerprint: args.passwordFingerprint,
      createdAt: now,
    });
    return { ok: true as const };
  },
});

export const updateListCredential = mutation({
  args: {
    id: v.id("listCredentials"),
    patch: v.object({
      listKey: v.optional(v.string()),
      passwordHash: v.optional(v.string()),
      passwordSalt: v.optional(v.string()),
      passwordIterations: v.optional(v.number()),
      passwordFingerprint: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { id, patch }) => {
    await ctx.db.patch(id, patch);
    return { ok: true as const };
  },
});

export const removeListCredential = mutation({
  args: { id: v.id("listCredentials") },
  handler: async (ctx, { id }) => {
    // Authorization check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const userRole = (identity as UserIdentityWithRole).role;
    const hasAdminRole = userRole === "org:admin";
    if (!hasAdminRole) throw new Error("Forbidden: admin role required");

    // Get credential info for logging
    const credential = await ctx.db.get(id);
    if (!credential) throw new NotFoundError("List credential");

    console.log(`[DELETE] Removing list credential ${id} (${credential.listKey}) for event ${credential.eventId}`);

    // Simply delete the credential - trigger handles cascading automatically!
    await ctx.db.delete(id);

    return { ok: true as const };
  },
});

// New mutation that handles listKey updates with cascading
export const updateListCredentialWithCascade = mutation({
  args: {
    id: v.id("listCredentials"),
    patch: v.object({
      listKey: v.optional(v.string()),
      passwordHash: v.optional(v.string()),
      passwordSalt: v.optional(v.string()),
      passwordIterations: v.optional(v.number()),
      passwordFingerprint: v.optional(v.string()),
      generateQR: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, { id, patch }) => {
    // Authorization check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const userRole = (identity as UserIdentityWithRole).role;
    const hasAdminRole = userRole === "org:admin";
    if (!hasAdminRole) throw new Error("Forbidden: admin role required");

    const credential = await ctx.db.get(id);
    if (!credential) throw new NotFoundError("List credential");

    // Check if listKey is changing
    if (patch.listKey && patch.listKey !== credential.listKey) {
      console.log(`[UPDATE] ListKey changing: ${credential.listKey} → ${patch.listKey} for credential ${id}`);

      // Count affected records to determine if we should batch
      const [rsvpCount, approvalCount, redemptionCount] = await Promise.all([
        ctx.db.query("rsvps")
          .withIndex("by_event", (q) => q.eq("eventId", credential.eventId))
          .filter((q) => q.eq(q.field("listKey"), credential.listKey))
          .collect()
          .then(results => results.length),
        ctx.db.query("approvals")
          .withIndex("by_event", (q) => q.eq("eventId", credential.eventId))
          .filter((q) => q.eq(q.field("listKey"), credential.listKey))
          .collect()
          .then(results => results.length),
        ctx.db.query("redemptions")
          .withIndex("by_event_user", (q) => q.eq("eventId", credential.eventId))
          .filter((q) => q.eq(q.field("listKey"), credential.listKey))
          .collect()
          .then(results => results.length)
      ]);

      const totalAffected = rsvpCount + approvalCount + redemptionCount;

      if (totalAffected > 100) {
        // Use batched update for large operations
        console.log(`[UPDATE] ${totalAffected} records affected, using batched update`);

        // Update the credential first
        await ctx.db.patch(id, patch);

        // Schedule batched listKey update
        await ctx.scheduler.runAfter(0, internal.cascades.batchUpdateListKey, {
          eventId: credential.eventId,
          credentialId: id,
          oldListKey: credential.listKey,
          newListKey: patch.listKey,
          cursor: undefined,
          batchSize: 500,
          phase: "rsvps"
        });

        return { ok: true, batched: true, affectedRecords: totalAffected };
      } else {
        // Inline update for smaller operations - triggers will handle cascade
        console.log(`[UPDATE] ${totalAffected} records affected, using inline update with triggers`);

        await ctx.db.patch(id, patch);
        return { ok: true, batched: false, affectedRecords: totalAffected };
      }
    } else {
      // No listKey change, simple update
      await ctx.db.patch(id, patch);
      return { ok: true, batched: false, affectedRecords: 0 };
    }
  },
});

export const get = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    return await ctx.db.get(eventId);
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("events").collect();
  },
});

export const getFeaturedEvent = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("events")
      .withIndex("by_featured", (q) => q.eq("isFeatured", true))
      .unique();
  },
});

export const setFeaturedEvent = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    // Check if current user is admin using Clerk role
    const userRole = (identity as UserIdentityWithRole).role;
    const hasAdminRole = userRole === "org:admin";
    if (!hasAdminRole) {
      throw new Error("Only admins can set featured events");
    }

    // Set all other events to not featured
    const allEvents = await ctx.db.query("events").collect();
    for (const event of allEvents) {
      if (event._id !== eventId && event.isFeatured) {
        await ctx.db.patch(event._id, {
          isFeatured: false,
          updatedAt: Date.now(),
        });
      }
    }

    // Set the selected event as featured
    await ctx.db.patch(eventId, {
      isFeatured: true,
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});
