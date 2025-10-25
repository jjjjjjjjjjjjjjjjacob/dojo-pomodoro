import { internalQuery } from "./functions";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

export type ExportContext = {
  event: Doc<"events">;
  approvedRsvps: Doc<"rsvps">[];
  listCredentials: Doc<"listCredentials">[];
  usersByClerkUserId: Record<string, Doc<"users">>;
  profilesByClerkUserId: Record<string, Doc<"profiles">>;
};

export const getRsvpsForExportInternal = internalQuery({
  args: {
    eventId: v.id("events"),
    listKeys: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { eventId, listKeys }): Promise<ExportContext> => {
    const event = await ctx.db.get(eventId);
    if (!event) throw new Error("Event not found");

    let approvedRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event_status", (query) =>
        query.eq("eventId", eventId).eq("status", "approved"),
      )
      .collect();

    if (listKeys && listKeys.length > 0) {
      approvedRsvps = approvedRsvps.filter((rsvp) =>
        listKeys.includes(rsvp.listKey),
      );
    }

    const clerkUserIds = [
      ...new Set(approvedRsvps.map((rsvp) => rsvp.clerkUserId)),
    ];

    const usersByClerkUserId: Record<string, Doc<"users">> = {};
    if (clerkUserIds.length > 0) {
      const userDocs = await Promise.all(
        clerkUserIds.map((clerkUserId) =>
          ctx.db
            .query("users")
            .withIndex("by_clerkUserId", (query) =>
              query.eq("clerkUserId", clerkUserId),
            )
            .unique(),
        ),
      );
      for (const user of userDocs) {
        if (user?.clerkUserId) {
          usersByClerkUserId[user.clerkUserId] = user;
        }
      }
    }

    const profilesByClerkUserId: Record<string, Doc<"profiles">> = {};
    if (clerkUserIds.length > 0) {
      const profileDocs = await Promise.all(
        clerkUserIds.map((clerkUserId) =>
          ctx.db
            .query("profiles")
            .withIndex("by_user", (query) =>
              query.eq("clerkUserId", clerkUserId),
            )
            .unique(),
        ),
      );
      for (const profile of profileDocs) {
        if (profile?.clerkUserId) {
          profilesByClerkUserId[profile.clerkUserId] = profile;
        }
      }
    }

    const listCredentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (query) => query.eq("eventId", eventId))
      .collect();

    return {
      event,
      approvedRsvps,
      listCredentials,
      usersByClerkUserId,
      profilesByClerkUserId,
    };
  },
});
