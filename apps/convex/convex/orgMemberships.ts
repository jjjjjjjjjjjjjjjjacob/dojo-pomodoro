import { mutation, query } from "./functions";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";

export const upsertMembership = mutation({
  args: {
    clerkUserId: v.string(),
    organizationId: v.string(),
    role: v.string(),
  },
  handler: async (ctx, { clerkUserId, organizationId, role }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("orgMemberships")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
      .filter((q) => q.eq(q.field("organizationId"), organizationId))
      .unique();
    if (!existing) {
      await ctx.db.insert("orgMemberships", {
        clerkUserId,
        organizationId,
        role,
        createdAt: now,
        updatedAt: now,
      });
      return { created: true } as const;
    } else {
      await ctx.db.patch(existing._id, { role, updatedAt: now });
      return { created: false } as const;
    }
  },
});

export const removeMembership = mutation({
  args: {
    clerkUserId: v.string(),
    organizationId: v.string(),
  },
  handler: async (ctx, { clerkUserId, organizationId }) => {
    const existing = await ctx.db
      .query("orgMemberships")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
      .filter((q) => q.eq(q.field("organizationId"), organizationId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { removed: true } as const;
    }
    return { removed: false } as const;
  },
});

export const listForUser = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    return await ctx.db
      .query("orgMemberships")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
      .collect();
  },
});
