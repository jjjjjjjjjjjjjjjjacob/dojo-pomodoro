import { mutation, query } from "./functions";
import { QueryCtx } from "./_generated/server";
import { api, components } from "./_generated/api";
import { v } from "convex/values";
import { Id, Doc } from "./_generated/dataModel";
import type { UserIdentity } from "convex/server";

type UserIdentityWithRole = UserIdentity & {
  role?: string;
};
import {
  insertRsvpIntoAggregate,
  updateRsvpInAggregate,
  deleteRsvpFromAggregate,
  countRsvpsWithAggregate,
} from "./lib/rsvpAggregate";

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

    // Fetch user to populate userName for search
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();

    const userName = user
      ? [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        ""
      : "";

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
      const rsvpId = await ctx.db.insert("rsvps", {
        eventId: args.eventId,
        clerkUserId,
        listKey: args.listKey,
        userName, // For search functionality
        note: args.note,
        shareContact: args.shareContact,
        attendees: requestedAttendees,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });

      // Sync with aggregate
      const newRsvp = await ctx.db.get(rsvpId);
      if (newRsvp) {
        await insertRsvpIntoAggregate(ctx, newRsvp);
      }
    } else {
      // Prevent re-requesting the same denied list
      if (existing.status === "denied" && existing.listKey === args.listKey) {
        throw new Error("Denied for this list; try a different password");
      }
      // Get old state before update for aggregate sync
      const oldRsvp = await ctx.db.get(existing._id);

      await ctx.db.patch(existing._id, {
        listKey: args.listKey,
        userName, // Keep userName in sync
        note: args.note,
        shareContact: args.shareContact,
        attendees: requestedAttendees,
        // Reset to pending when re-requesting (unless already approved)
        status: existing.status === "approved" ? existing.status : "pending",
        updatedAt: now,
      });

      // Sync with aggregate
      const newRsvp = await ctx.db.get(existing._id);
      if (oldRsvp && newRsvp) {
        await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
      }
    }

    return { ok: true as const };
  },
});

export const listForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }): Promise<Array<{
    id: Id<"rsvps">;
    clerkUserId: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    listKey: string;
    note?: string;
    status: string;
    attendees?: number;
    contact?: { email?: string; phone?: string };
    metadata?: Record<string, unknown>;
    redemptionStatus: "none" | "issued" | "redeemed" | "disabled";
    redemptionCode?: string;
    createdAt: number;
  }>> => {
    const rows = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    const enriched = await Promise.all(
      rows.map(async (r): Promise<{
        id: Id<"rsvps">;
        clerkUserId: string;
        name?: string;
        firstName?: string;
        lastName?: string;
        listKey: string;
        note?: string;
        status: string;
        attendees?: number;
        contact?: { email?: string; phone?: string };
        metadata?: Record<string, unknown>;
        redemptionStatus: "none" | "issued" | "redeemed" | "disabled";
        redemptionCode?: string;
        createdAt: number;
      }> => {
        // Look up user's display name
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerkUserId", (q) =>
            q.eq("clerkUserId", r.clerkUserId),
          )
          .unique();
        // User name constructed from firstName/lastName in display logic
        const firstName = user?.firstName;
        const lastName = user?.lastName;
        const name = [firstName, lastName].filter(Boolean).join(" ") || undefined;
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
          const prof: { hasEmail: boolean; hasPhone: boolean; emailObfuscated?: string; phoneObfuscated?: string } | null = await ctx.runQuery(api.profiles.getForClerk, {
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

// Count query for filtered RSVPs using aggregate
export const countForEventFiltered = query({
  args: {
    eventId: v.id("events"),
    statusFilter: v.optional(v.string()),
    listFilter: v.optional(v.string()),
    guestSearch: v.optional(v.string()),
    redemptionFilter: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      eventId,
      statusFilter = "all",
      listFilter = "all",
      guestSearch = "",
      redemptionFilter = "all",
    },
  ) => {
    // If there's a guest search, fall back to manual counting
    // (aggregate doesn't support text search)
    if (guestSearch.trim()) {
      let baseQuery = ctx.db
        .query("rsvps")
        .withSearchIndex("search_text", (q) => {
          let searchQuery = q.search("userName", guestSearch.trim());
          searchQuery = searchQuery.eq("eventId", eventId);
          if (statusFilter !== "all") {
            searchQuery = searchQuery.eq("status", statusFilter);
          }
          // Note: Cannot filter by listKey in search index, will filter after
          return searchQuery;
        });

      // Apply list filter after getting results (needed for search queries)
      let results = await baseQuery.collect();
      if (listFilter !== "all") {
        results = results.filter((rsvp) => rsvp.listKey === listFilter);
      }

      if (redemptionFilter === "all") {
        return results.length;
      }

      // Filter by redemption status - need to check redemptions table
      let filteredResults = results;
      if (redemptionFilter !== "all") {
        const redemptions = await Promise.all(
          results.map(async (rsvp) =>
            ctx.db
              .query("redemptions")
              .withIndex("by_event_user", (q) =>
                q.eq("eventId", eventId).eq("clerkUserId", rsvp.clerkUserId),
              )
              .unique(),
          ),
        );

        filteredResults = results.filter((rsvp, index) => {
          const redemption = redemptions[index];
          let redemptionStatus = "none";
          if (redemption) {
            if (redemption.disabledAt) redemptionStatus = "disabled";
            else if (redemption.redeemedAt) redemptionStatus = "redeemed";
            else redemptionStatus = "issued";
          }

          if (redemptionFilter === "not-issued") {
            return redemptionStatus === "none";
          }
          return redemptionStatus === redemptionFilter;
        });
      }

      return filteredResults.length;
    }

    // Use aggregate for efficient counting

    // First, test aggregate health

    const baseCount = await countRsvpsWithAggregate(
      ctx,
      eventId,
      statusFilter,
      listFilter,
    );

    // For redemption filtering, we still need to check manually
    // since redemption status is in a separate table
    if (redemptionFilter !== "all") {
      // Get all RSVPs matching the current filters
      let baseQuery = ctx.db
        .query("rsvps")
        .withIndex("by_event", (q) => q.eq("eventId", eventId));

      if (statusFilter !== "all") {
        baseQuery = baseQuery.filter((q) =>
          q.eq(q.field("status"), statusFilter),
        );
      }
      if (listFilter !== "all") {
        // credentialId field has been removed from schema
        // Filter by listKey only
        baseQuery = baseQuery.filter((q: any) =>
          q.eq(q.field("listKey"), listFilter),
        );
      }

      const rsvps = await baseQuery.collect();

      // Check redemption status for each
      const redemptions = await Promise.all(
        rsvps.map(async (rsvp) =>
          ctx.db
            .query("redemptions")
            .withIndex("by_event_user", (q) =>
              q.eq("eventId", eventId).eq("clerkUserId", rsvp.clerkUserId),
            )
            .unique(),
        ),
      );

      const filteredRsvps = rsvps.filter((rsvp, index) => {
        const redemption = redemptions[index];
        let redemptionStatus = "none";
        if (redemption) {
          if (redemption.disabledAt) redemptionStatus = "disabled";
          else if (redemption.redeemedAt) redemptionStatus = "redeemed";
          else redemptionStatus = "issued";
        }

        if (redemptionFilter === "not-issued") {
          return redemptionStatus === "none";
        }
        return redemptionStatus === redemptionFilter;
      });

      return filteredRsvps.length;
    }

    return baseCount;
  },
});

// Type definitions for enriched RSVP data
type EnrichedRsvp = {
  id: Id<"rsvps">;
  clerkUserId: string;
  name: string;
  firstName: string;
  lastName: string;
  listKey: string;
  // credentialId field has been removed from schema
  note?: string;
  status: string;
  attendees?: number;
  contact?: {
    email?: string;
    phone?: string;
  };
  metadata?: Record<string, unknown>;
  redemptionStatus: "none" | "issued" | "redeemed" | "disabled";
  redemptionCode?: string;
  createdAt: number;
};

type PaginatedRsvpResult = {
  page: EnrichedRsvp[];
  nextCursor: string | null;
  isDone: boolean;
};

export const listForEventPaginated = query({
  args: {
    eventId: v.id("events"),
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
    guestSearch: v.optional(v.string()),
    statusFilter: v.optional(v.string()),
    listFilter: v.optional(v.string()), // Filter by list key
    redemptionFilter: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      eventId,
      cursor,
      pageSize = 20,
      guestSearch = "",
      statusFilter = "all",
      listFilter = "all",
      redemptionFilter = "all",
    },
  ): Promise<PaginatedRsvpResult> => {
    // Choose the most efficient index based on filters
    let baseQuery: any = ctx.db.query("rsvps");

    // Use text search if searching by guest name
    if (guestSearch.trim()) {
      baseQuery = baseQuery.withSearchIndex("search_text", (q: any) => {
        let searchQuery = q.search("userName", guestSearch.trim());
        searchQuery = searchQuery.eq("eventId", eventId);
        if (statusFilter !== "all") {
          searchQuery = searchQuery.eq("status", statusFilter);
        }
        // Note: Cannot filter by listKey in search index, will filter after pagination
        return searchQuery;
      });
    } else {
      // Use indexes for efficient filtering - for now using basic indexes since we're filtering by listKey
      if (statusFilter !== "all") {
        baseQuery = baseQuery.withIndex("by_event_status", (q: any) =>
          q.eq("eventId", eventId).eq("status", statusFilter),
        );
      } else {
        baseQuery = baseQuery.withIndex("by_event", (q: any) =>
          q.eq("eventId", eventId),
        );
      }

      // Apply listKey filter after index filtering
      if (listFilter !== "all") {
        // credentialId field has been removed from schema
        // Filter by listKey only
        baseQuery = baseQuery.filter((q: any) =>
          q.eq(q.field("listKey"), listFilter),
        );
      }
    }

    // Use proper Convex cursor-based pagination
    let paginatedResult;
    if (guestSearch.trim()) {
      // For search queries, don't apply ordering (they use relevance order)
      paginatedResult = await baseQuery.paginate({
        cursor: cursor ?? null,
        numItems: pageSize,
      });
    } else {
      // For non-search queries, apply descending order
      paginatedResult = await baseQuery.order("desc").paginate({
        cursor: cursor ?? null,
        numItems: pageSize,
      });
    }

    // Batch fetch related data to avoid N+1 queries
    // Note: credentialId field has been removed from schema
    // We'll handle credential lookups via listKey when needed

    // Batch fetch user data for metadata (custom fields)
    const userClerkIds = [
      ...new Set(paginatedResult.page.map((r: Doc<"rsvps">) => r.clerkUserId)),
    ] as string[];
    const users = await Promise.all(
      userClerkIds.map(async (clerkUserId: string) =>
        ctx.db
          .query("users")
          .withIndex("by_clerkUserId", (q: any) =>
            q.eq("clerkUserId", clerkUserId),
          )
          .unique(),
      ),
    );
    const userMap = Object.fromEntries(
      users.filter((u) => u).map((u) => [u!.clerkUserId, u]),
    );

    // Batch fetch redemption data
    const redemptions = await Promise.all(
      paginatedResult.page.map(async (rsvp: Doc<"rsvps">) =>
        ctx.db
          .query("redemptions")
          .withIndex("by_event_user", (q) =>
            q.eq("eventId", eventId).eq("clerkUserId", rsvp.clerkUserId),
          )
          .unique(),
      ),
    );
    const redemptionMap = Object.fromEntries(
      redemptions.filter((r) => r).map((r) => [r!.clerkUserId, r]),
    );

    // Enrich with batched data (avoid N+1 queries)
    let enrichedPage = paginatedResult.page.map((rsvp: Doc<"rsvps">) => {
      const redemption = redemptionMap[rsvp.clerkUserId];
      let redemptionStatus: "none" | "issued" | "redeemed" | "disabled" =
        "none";
      if (redemption) {
        if (redemption.disabledAt) redemptionStatus = "disabled";
        else if (redemption.redeemedAt) redemptionStatus = "redeemed";
        else redemptionStatus = "issued";
      }

      // credentialId field has been removed from schema
      // Credential lookups now use listKey only
      const user = userMap[rsvp.clerkUserId];

      return {
        id: rsvp._id,
        clerkUserId: rsvp.clerkUserId,
        name:
          [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
          user?.name ||
          rsvp.userName ||
          "", // PRIORITY: users table (fresh data) → rsvp.userName (fallback)
        firstName: user?.firstName ||
          (rsvp.userName ? rsvp.userName.split(" ")[0] : ""),
        lastName: user?.lastName ||
          (rsvp.userName ? rsvp.userName.split(" ").slice(1).join(" ") : ""),
        listKey: rsvp.listKey || "",
        note: rsvp.note,
        status: rsvp.status,
        attendees: rsvp.attendees,
        contact: rsvp.shareContact
          ? {
              // userEmail and userPhone fields have been removed from schema
              // Contact info now comes from profiles table via API call
              // For paginated results, we skip contact fetching for performance
              // Use listForEvent query for contact information when needed
              email: undefined,
              phone: undefined,
            }
          : undefined,
        metadata: user?.metadata, // Include user metadata for custom fields
        redemptionStatus,
        redemptionCode: redemption?.code,
        createdAt: rsvp.createdAt,
      };
    });

    // Apply redemption filter after enrichment
    if (redemptionFilter !== "all") {
      if (redemptionFilter === "not-issued") {
        enrichedPage = enrichedPage.filter(
          (rsvp: any) => rsvp.redemptionStatus === "none",
        );
      } else {
        enrichedPage = enrichedPage.filter(
          (rsvp: any) => rsvp.redemptionStatus === redemptionFilter,
        );
      }
    }

    // Apply listKey filter after enrichment (needed for search queries)
    if (guestSearch.trim() && listFilter !== "all") {
      enrichedPage = enrichedPage.filter(
        (rsvp: EnrichedRsvp) => rsvp.listKey === listFilter,
      );
    }

    return {
      page: enrichedPage,
      nextCursor: paginatedResult.continueCursor,
      isDone: paginatedResult.isDone,
    };
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
    let listCredential = null;
    if (chosen.listKey) {
      // Fallback to listKey lookup for backward compatibility
      listCredential = await ctx.db
        .query("listCredentials")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .filter((q) => q.eq(q.field("listKey"), chosen.listKey))
        .unique();
    }

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

    // Get old state before update for aggregate sync
    const oldRsvp = await ctx.db.get(rsvp._id);

    await ctx.db.patch(rsvp._id, {
      status: "attending",
      updatedAt: Date.now(),
    });

    // Sync with aggregate
    const newRsvp = await ctx.db.get(rsvp._id);
    if (oldRsvp && newRsvp) {
      await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
    }
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

    // Sync with aggregate
    const newRsvp = await ctx.db.get(rsvpId);
    if (newRsvp) {
      await insertRsvpIntoAggregate(ctx, newRsvp);
    }

    return rsvpId;
  },
});

// Delete an RSVP (for cleaning up test data)
export const deleteRSVP = mutation({
  args: {
    rsvpId: v.id("rsvps"),
  },
  handler: async (ctx, args) => {
    // Get RSVP before deleting for aggregate sync
    const rsvp = await ctx.db.get(args.rsvpId);

    await ctx.db.delete(args.rsvpId);

    // Sync with aggregate
    if (rsvp) {
      await deleteRsvpFromAggregate(ctx, rsvp);
    }

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
      // Get old state before update for aggregate sync
      const oldRsvp = await ctx.db.get(args.rsvpId);

      await ctx.db.patch(args.rsvpId, {
        status: args.approvalStatus,
        updatedAt: now,
      });

      // Sync with aggregate
      const newRsvp = await ctx.db.get(args.rsvpId);
      if (oldRsvp && newRsvp) {
        await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
      }

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

    // Get RSVP before deleting for aggregate sync (already have it from line 927)

    // Delete the RSVP itself
    await ctx.db.delete(args.rsvpId);

    // Sync with aggregate
    if (rsvp) {
      await deleteRsvpFromAggregate(ctx, rsvp);
    }

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

    // Get old state before update for aggregate sync
    const oldRsvp = await ctx.db.get(args.rsvpId);

    await ctx.db.patch(args.rsvpId, {
      listKey: args.listKey,
    });

    // Sync with aggregate
    const newRsvp = await ctx.db.get(args.rsvpId);
    if (oldRsvp && newRsvp) {
      await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
    }

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

// Bulk update list key for multiple RSVPs
export const bulkUpdateListKey = mutation({
  args: {
    updates: v.array(
      v.object({
        rsvpId: v.id("rsvps"),
        listKey: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const role = (identity as any).role;
    const hasAdminRole = role === "org:admin";
    if (!hasAdminRole) throw new Error("Forbidden: admin role required");

    const results = { success: 0, failed: 0, errors: [] as string[] };

    // Process all updates in a single transaction
    for (const update of args.updates) {
      try {
        const rsvp = await ctx.db.get(update.rsvpId);
        if (!rsvp) {
          results.failed++;
          results.errors.push(`RSVP ${update.rsvpId} not found`);
          continue;
        }

        // Get old state before update for aggregate sync
        const oldRsvp = await ctx.db.get(update.rsvpId);

        // Update RSVP
        await ctx.db.patch(update.rsvpId, { listKey: update.listKey });

        // Sync with aggregate
        const newRsvp = await ctx.db.get(update.rsvpId);
        if (oldRsvp && newRsvp) {
          await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
        }

        // Update related redemption if exists
        const redemption = await ctx.db
          .query("redemptions")
          .withIndex("by_event_user", (q) =>
            q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
          )
          .unique();
        if (redemption) {
          await ctx.db.patch(redemption._id, { listKey: update.listKey });
        }

        // Update approvals
        const approvals = await ctx.db
          .query("approvals")
          .filter((q) => q.eq(q.field("rsvpId"), update.rsvpId))
          .collect();
        for (const approval of approvals) {
          await ctx.db.patch(approval._id, { listKey: update.listKey });
        }

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Failed to update ${update.rsvpId}: ${error}`);
      }
    }

    return results;
  },
});

// Migrations for aggregate backfilling
import { Migrations } from "@convex-dev/migrations";

export const migrations = new Migrations(components.migrations);
export const run = migrations.runner();

export const backfillRsvpAggregate = migrations.define({
  table: "rsvps",
  migrateOne: async (ctx, rsvpDoc) => {
    // Insert existing record into aggregate
    await insertRsvpIntoAggregate(ctx, rsvpDoc);
  },
});

// Bulk update approval status for multiple RSVPs
export const bulkUpdateApproval = mutation({
  args: {
    updates: v.array(
      v.object({
        rsvpId: v.id("rsvps"),
        approvalStatus: v.union(
          v.literal("pending"),
          v.literal("approved"),
          v.literal("denied"),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const role = (identity as any).role;
    const hasAdminRole = role === "org:admin";
    if (!hasAdminRole) throw new Error("Forbidden: admin role required");

    const results = { success: 0, failed: 0, errors: [] as string[] };
    const now = Date.now();

    for (const update of args.updates) {
      try {
        const rsvp = await ctx.db.get(update.rsvpId);
        if (!rsvp) {
          results.failed++;
          results.errors.push(`RSVP ${update.rsvpId} not found`);
          continue;
        }

        // Get old state before update for aggregate sync
        const oldRsvp = await ctx.db.get(update.rsvpId);

        // Update approval status
        await ctx.db.patch(update.rsvpId, {
          status: update.approvalStatus,
          updatedAt: now,
        });

        // Sync with aggregate
        const newRsvp = await ctx.db.get(update.rsvpId);
        if (oldRsvp && newRsvp) {
          await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
        }

        // Handle redemption based on approval status
        if (update.approvalStatus === "approved") {
          await ctx.runMutation(api.redemptions.updateTicketStatus, {
            rsvpId: update.rsvpId,
            status: "issued",
          });
        } else if (update.approvalStatus === "denied") {
          const redemption = await ctx.db
            .query("redemptions")
            .withIndex("by_event_user", (q) =>
              q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
            )
            .unique();
          if (redemption && !redemption.disabledAt) {
            await ctx.db.patch(redemption._id, { disabledAt: now });
          }
        }

        // Record approval audit
        await ctx.db.insert("approvals", {
          eventId: rsvp.eventId,
          rsvpId: update.rsvpId,
          clerkUserId: rsvp.clerkUserId,
          listKey: rsvp.listKey,
          decision: update.approvalStatus,
          decidedBy: identity.subject,
          decidedAt: now,
        });

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Failed to update ${update.rsvpId}: ${error}`);
      }
    }

    return results;
  },
});

// Bulk update ticket status for multiple RSVPs
export const bulkUpdateTicketStatus = mutation({
  args: {
    updates: v.array(
      v.object({
        rsvpId: v.id("rsvps"),
        ticketStatus: v.union(
          v.literal("issued"),
          v.literal("not-issued"),
          v.literal("disabled"),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const role = (identity as any).role;
    const hasAdminRole = role === "org:admin";
    if (!hasAdminRole) throw new Error("Forbidden: admin role required");

    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const update of args.updates) {
      try {
        await ctx.runMutation(api.redemptions.updateTicketStatus, {
          rsvpId: update.rsvpId,
          status: update.ticketStatus,
        });
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Failed to update ${update.rsvpId}: ${error}`);
      }
    }

    return results;
  },
});

// Bulk delete multiple RSVPs
export const bulkDeleteRsvps = mutation({
  args: {
    rsvpIds: v.array(v.id("rsvps")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const role = (identity as any).role;
    const hasAdminRole = role === "org:admin";
    if (!hasAdminRole) throw new Error("Forbidden: admin role required");

    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const rsvpId of args.rsvpIds) {
      try {
        const rsvp = await ctx.db.get(rsvpId);
        if (!rsvp) {
          results.failed++;
          results.errors.push(`RSVP ${rsvpId} not found`);
          continue;
        }

        // Delete redemption
        const redemption = await ctx.db
          .query("redemptions")
          .withIndex("by_event_user", (q) =>
            q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
          )
          .unique();
        if (redemption) {
          await ctx.db.delete(redemption._id);
        }

        // Delete approvals
        const approvals = await ctx.db
          .query("approvals")
          .filter((q) => q.eq(q.field("rsvpId"), rsvpId))
          .collect();
        for (const approval of approvals) {
          await ctx.db.delete(approval._id);
        }

        // Get RSVP before deleting for aggregate sync (already have it from line 1233)

        // Delete RSVP
        await ctx.db.delete(rsvpId);

        // Sync with aggregate
        if (rsvp) {
          await deleteRsvpFromAggregate(ctx, rsvp);
        }

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Failed to delete ${rsvpId}: ${error}`);
      }
    }

    return results;
  },
});
