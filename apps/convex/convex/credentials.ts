import { query } from "./_generated/server";
import { v } from "convex/values";

export const getCredsForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    return await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
  },
});

export const getByFingerprint = query({
  args: { fingerprint: v.string() },
  handler: async (ctx, { fingerprint }) => {
    return await ctx.db
      .query("listCredentials")
      .withIndex("by_fingerprint", (q) => q.eq("passwordFingerprint", fingerprint))
      .collect();
  },
});
