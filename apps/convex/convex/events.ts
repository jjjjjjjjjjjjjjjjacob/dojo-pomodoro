import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { EventPatch, ValidationError, NotFoundError } from "./lib/types";
// Node crypto-based creation is handled in eventsNode.ts (action).
// This module contains only queries/mutations compatible with the standard runtime.

export const insertWithCreds = mutation({
  args: {
    name: v.string(),
    hosts: v.array(v.string()),
    location: v.string(),
    flyerUrl: v.optional(v.string()),
    flyerStorageId: v.optional(v.id("_storage")),
    eventDate: v.number(),
    maxAttendees: v.optional(v.number()),
    customFields: v.optional(
      v.array(
        v.object({
          key: v.string(),
          label: v.string(),
          placeholder: v.optional(v.string()),
          required: v.optional(v.boolean()),
        }),
      ),
    ),
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
      hosts: args.hosts,
      location: args.location,
      flyerUrl: args.flyerUrl,
      flyerStorageId: args.flyerStorageId,
      eventDate: args.eventDate,
      maxAttendees: args.maxAttendees,
      customFields: args.customFields,
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
    hosts: v.optional(v.array(v.string())),
    location: v.optional(v.string()),
    flyerUrl: v.optional(v.string()),
    flyerStorageId: v.optional(v.id("_storage")),
    eventDate: v.optional(v.number()),
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
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new NotFoundError("Event");

    const patch: EventPatch & { updatedAt: number } = { updatedAt: Date.now() };
    const updateableFields = [
      "name",
      "hosts",
      "location",
      "flyerUrl",
      "flyerStorageId",
      "eventDate",
      "maxAttendees",
      "isFeatured",
      "customFields",
    ] as const;

    for (const fieldKey of updateableFields) {
      if (args[fieldKey] !== undefined) {
        (patch as any)[fieldKey] = args[fieldKey];
      }
    }
    await ctx.db.patch(args.eventId, patch);
    return { ok: true };
  },
});

export const remove = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    // Delete credentials for this event
    const creds = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    for (const credential of creds) await ctx.db.delete(credential._id);
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
    await ctx.db.delete(id);
    return { ok: true as const };
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
    const userRole = (identity as any).role;
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
