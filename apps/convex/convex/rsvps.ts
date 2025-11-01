import { internalQuery } from "./_generated/server";
import { mutation, query } from "./functions";
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
import { NotFoundError } from "./lib/types";

export const submitRequest = mutation({
  args: {
    eventId: v.id("events"),
    listKey: v.string(),
    note: v.optional(v.string()),
    shareContact: v.boolean(),
    attendees: v.optional(v.number()),
    smsConsent: v.optional(v.boolean()), // SMS consent from user
    smsConsentIpAddress: v.optional(v.string()), // IP address for compliance
    // Contact is optional because user may have an existing encrypted profile.
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    customFields: v.optional(v.record(v.string(), v.string())),
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
      ? [user.firstName, user.lastName].filter(Boolean).join(" ") || ""
      : "";

    // Ensure event exists and is active
    const event = await ctx.db.get(args.eventId);
    const now = Date.now();
    if (!event || (event.status && event.status !== "active"))
      throw new Error("Event not available");
    const eventFieldMap = new Map(
      (event.customFields ?? []).map((field) => [field.key, field]),
    );

    const sanitizedCustomFieldValues = args.customFields
      ? Object.fromEntries(
          Object.entries(args.customFields)
            .map(([fieldKey, rawValue]) => {
              const fieldConfig = eventFieldMap.get(fieldKey);
              if (!fieldConfig) return null;
              const stringValue =
                typeof rawValue === "string" ? rawValue : `${rawValue ?? ""}`;
              const finalValue =
                fieldConfig.trimWhitespace === false
                  ? stringValue
                  : stringValue.trim();
              if (!finalValue) return null;
              return [fieldKey, finalValue];
            })
            .filter(
              (
                entry,
              ): entry is [string, string] => entry !== null,
            ),
        )
      : undefined;

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

    let smsConsentChange: "enabled" | "disabled" | null = null;
    if (!existing) {
      if (args.smsConsent === true) {
        smsConsentChange = "enabled";
      }
    } else {
      if (args.smsConsent === true && existing.smsConsent !== true) {
        smsConsentChange = "enabled";
      } else if (args.smsConsent === false && existing.smsConsent === true) {
        smsConsentChange = "disabled";
      }
    }

    const sanitizedSmsConsentIpAddress =
      args.smsConsent === true && typeof args.smsConsentIpAddress === "string"
        ? args.smsConsentIpAddress.slice(0, 256)
        : undefined;

    if (!existing) {
      const rsvpId = await ctx.db.insert("rsvps", {
        eventId: args.eventId,
        clerkUserId,
        listKey: args.listKey,
        ticketStatus: "not-issued",
        userName, // For search functionality
        note: args.note,
        shareContact: args.shareContact,
        attendees: requestedAttendees,
        smsConsent: args.smsConsent,
        smsConsentTimestamp: args.smsConsent !== undefined ? now : undefined,
        smsConsentIpAddress:
          args.smsConsent === true ? sanitizedSmsConsentIpAddress : undefined,
        customFieldValues:
          sanitizedCustomFieldValues &&
          Object.keys(sanitizedCustomFieldValues).length > 0
            ? sanitizedCustomFieldValues
            : undefined,
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
        smsConsent: args.smsConsent,
        smsConsentTimestamp:
          args.smsConsent !== undefined ? now : existing.smsConsentTimestamp,
        smsConsentIpAddress:
          args.smsConsent === true
            ? sanitizedSmsConsentIpAddress ?? existing.smsConsentIpAddress
            : existing.smsConsentIpAddress,
        customFieldValues:
          sanitizedCustomFieldValues !== undefined
            ? Object.keys(sanitizedCustomFieldValues).length > 0
              ? sanitizedCustomFieldValues
              : undefined
            : existing.customFieldValues,
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

    if (smsConsentChange) {
      await ctx.scheduler.runAfter(0, api.notifications.sendSmsConsentStatusMessage, {
        eventId: args.eventId,
        clerkUserId,
        consentEnabled: smsConsentChange === "enabled",
      });
    }

    return { ok: true as const };
  },
});

/**
 * Internal query to check if a user has consented to SMS for a specific event.
 * Used by SMS infrastructure to verify consent before sending messages.
 * NOTE: Consent is recorded per RSVP when the guest explicitly opts in.
 */
export const checkSmsConsentForUserEvent = internalQuery({
  args: {
    eventId: v.id("events"),
    clerkUserId: v.string(),
  },
  handler: async (ctx, { eventId, clerkUserId }) => {
    const rsvp = await ctx.db
      .query("rsvps")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", eventId).eq("clerkUserId", clerkUserId),
      )
      .unique();

    const hasConsented = rsvp?.smsConsent === true;
    return {
      hasConsented,
      consentTimestamp: rsvp?.smsConsentTimestamp ?? null,
      consentIpAddress: rsvp?.smsConsentIpAddress,
      rsvpStatus: rsvp?.status,
    };
  },
});

export const getApprovedRsvpWithRedemption = internalQuery({
  args: {
    eventId: v.id("events"),
    clerkUserId: v.string(),
  },
  handler: async (ctx, { eventId, clerkUserId }) => {
    const rsvp = await ctx.db
      .query("rsvps")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", eventId).eq("clerkUserId", clerkUserId),
      )
      .unique();

    if (!rsvp || (rsvp.status !== "approved" && rsvp.status !== "attending")) {
      return null;
    }

    const redemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", eventId).eq("clerkUserId", clerkUserId),
      )
      .unique();

    if (!redemption) {
      return null;
    }

    return {
      rsvpId: rsvp._id,
      listKey: rsvp.listKey,
      shareContact: rsvp.shareContact,
      redemptionCode: redemption.code,
    };
  },
});

export const listForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const clerkUserId = identity.subject;
    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
      .order("desc")
      .collect();

    if (rsvps.length === 0) return [];

    const uniqueEventIds = Array.from(
      new Set(rsvps.map((rsvp) => rsvp.eventId)),
    );
    const eventEntries = await Promise.all(
      uniqueEventIds.map(async (eventId) => ({
        eventId,
        event: await ctx.db.get(eventId),
      })),
    );
    const eventMap = new Map(
      eventEntries
        .filter((entry) => entry.event)
        .map((entry) => [entry.eventId, entry.event!]),
    );

    return rsvps.map((rsvp) => {
      const event = eventMap.get(rsvp.eventId);
      const customFieldDefinitions = event?.customFields ?? [];
      const customFields = customFieldDefinitions.map((definition) => ({
        key: definition.key,
        label: definition.label,
        value: rsvp.customFieldValues?.[definition.key] ?? "",
        required: definition.required ?? false,
        copyEnabled: definition.copyEnabled ?? false,
        prependUrl: definition.prependUrl ?? "",
        trimWhitespace: definition.trimWhitespace !== false,
      }));

      return {
        rsvpId: rsvp._id,
        eventId: rsvp.eventId,
        eventName: event?.name ?? "Untitled Event",
        eventSecondaryTitle: event?.secondaryTitle,
        eventDate: event?.eventDate ?? null,
        eventTimezone: event?.eventTimezone,
        eventHostNames: event?.hosts ?? [],
        productionCompany: event?.productionCompany,
        listKey: rsvp.listKey,
        smsConsent: rsvp.smsConsent ?? false,
        shareContact: rsvp.shareContact,
        updatedAt: rsvp.updatedAt,
        customFields,
      };
    });
  },
});

export const updateSmsPreference = mutation({
  args: {
    rsvpId: v.optional(v.id("rsvps")),
    smsConsent: v.boolean(),
    applyToAll: v.optional(v.boolean()),
    smsConsentIpAddress: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { rsvpId, smsConsent, applyToAll, smsConsentIpAddress },
  ) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const clerkUserId = identity.subject;
    const now = Date.now();
    const sanitizedSmsConsentIpAddress =
      smsConsent && typeof smsConsentIpAddress === "string"
        ? smsConsentIpAddress.slice(0, 256)
        : undefined;

    const notificationsByEvent = new Map<Id<"events">, boolean>();
    let updatedCount = 0;

    if (applyToAll || !rsvpId) {
      const rsvps = await ctx.db
        .query("rsvps")
        .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
        .collect();
      await Promise.all(
        rsvps.map((rsvp) =>
          ctx.db.patch(rsvp._id, {
            smsConsent,
            smsConsentTimestamp: now,
            smsConsentIpAddress: smsConsent
              ? sanitizedSmsConsentIpAddress ?? rsvp.smsConsentIpAddress
              : rsvp.smsConsentIpAddress,
            updatedAt: now,
          }),
        ),
      );
      rsvps.forEach((rsvp) => {
        if (rsvp.smsConsent !== smsConsent) {
          notificationsByEvent.set(rsvp.eventId, smsConsent);
        }
      });
      updatedCount = rsvps.length;
    } else {
      const rsvp = await ctx.db.get(rsvpId);
      if (!rsvp) throw new NotFoundError("RSVP");
      if (rsvp.clerkUserId !== clerkUserId) throw new Error("Forbidden");
      if (rsvp.smsConsent === smsConsent) return { updated: 0 };

      await ctx.db.patch(rsvpId, {
        smsConsent,
        smsConsentTimestamp: now,
        smsConsentIpAddress: smsConsent
          ? sanitizedSmsConsentIpAddress ?? rsvp.smsConsentIpAddress
          : rsvp.smsConsentIpAddress,
        updatedAt: now,
      });
      notificationsByEvent.set(rsvp.eventId, smsConsent);
      updatedCount = 1;
    }

    if (notificationsByEvent.size > 0) {
      await Promise.all(
        Array.from(notificationsByEvent.entries()).map(
          ([eventId, consentEnabled]) =>
            ctx.scheduler.runAfter(0, api.notifications.sendSmsConsentStatusMessage, {
              eventId,
              clerkUserId,
              consentEnabled,
            }),
        ),
      );
    }

    return { updated: updatedCount };
  },
});

export const updateSharedFields = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    fields: v.record(v.string(), v.string()),
  },
  handler: async (ctx, { rsvpId, fields }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const clerkUserId = identity.subject;

    const rsvp = await ctx.db.get(rsvpId);
    if (!rsvp) throw new NotFoundError("RSVP");
    if (rsvp.clerkUserId !== clerkUserId) throw new Error("Forbidden");

    const event = await ctx.db.get(rsvp.eventId);
    if (!event) throw new NotFoundError("Event");

    const fieldDefinitions = new Map(
      (event.customFields ?? []).map((definition) => [definition.key, definition]),
    );

    const nextValues: Record<string, string> = {
      ...(rsvp.customFieldValues ?? {}),
    };

    for (const [fieldKey, rawValue] of Object.entries(fields)) {
      const definition = fieldDefinitions.get(fieldKey);
      if (!definition) continue;
      const stringValue =
        typeof rawValue === "string" ? rawValue : `${rawValue ?? ""}`;
      const finalValue =
        definition.trimWhitespace === false
          ? stringValue
          : stringValue.trim();
      if (finalValue) {
        nextValues[fieldKey] = finalValue;
      } else {
        delete nextValues[fieldKey];
      }
    }

    await ctx.db.patch(rsvpId, {
      customFieldValues:
        Object.keys(nextValues).length > 0 ? nextValues : undefined,
      updatedAt: Date.now(),
    });

    return {
      ok: true as const,
      customFieldValues: Object.keys(nextValues).length > 0 ? nextValues : undefined,
    };
  },
});

export const listForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (
    ctx,
    { eventId },
  ): Promise<
    Array<{
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
      redemptionStatus: "none" | "issued" | "redeemed" | "disabled";
      redemptionCode?: string;
      createdAt: number;
    }>
  > => {
    const rows = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    const enriched = await Promise.all(
      rows.map(
        async (
          r,
        ): Promise<{
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
          customFieldValues?: Record<string, string>;
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
          const name =
            [firstName, lastName].filter(Boolean).join(" ") || undefined;
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
            const prof: {
              hasEmail: boolean;
              hasPhone: boolean;
              emailObfuscated?: string;
              phoneObfuscated?: string;
            } | null = await ctx.runQuery(api.profiles.getForClerk, {
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
            customFieldValues: r.customFieldValues ?? undefined,
            redemptionStatus,
            redemptionCode: redemption?.code,
            createdAt: r.createdAt,
          };
        },
      ),
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
    const normalizeTicketStatusFilter = (
      filter: string,
    ): "not-issued" | "issued" | "disabled" | "redeemed" | null => {
      if (filter === "not-issued") return "not-issued";
      if (filter === "issued" || filter === "disabled" || filter === "redeemed")
        return filter;
      return null;
    };

    const ticketStatusFilter = normalizeTicketStatusFilter(redemptionFilter);

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
          if (ticketStatusFilter && ticketStatusFilter !== "not-issued") {
            searchQuery = searchQuery.eq("ticketStatus", ticketStatusFilter);
          }
          // Note: Cannot filter by listKey in search index, will filter after
          return searchQuery;
        });

      // Apply list filter after getting results (needed for search queries)
      let results = await baseQuery.collect();
      if (listFilter !== "all") {
        results = results.filter((rsvp) => rsvp.listKey === listFilter);
      }

      if (ticketStatusFilter) {
        results = results.filter((rsvp) => {
          const status =
            (rsvp.ticketStatus as
              | "not-issued"
              | "issued"
              | "disabled"
              | "redeemed"
              | undefined) ?? "not-issued";
          if (ticketStatusFilter === "not-issued") {
            return status === "not-issued";
          }
          return status === ticketStatusFilter;
        });
      }

      return results.length;
    }

    if (ticketStatusFilter) {
      let ticketStatusQuery = ctx.db
        .query("rsvps")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .filter((q) => {
          if (ticketStatusFilter === "not-issued") {
            return q.or(
              q.eq(q.field("ticketStatus"), "not-issued"),
              q.eq(q.field("ticketStatus"), undefined),
            );
          }
          return q.eq(q.field("ticketStatus"), ticketStatusFilter);
        });

      if (statusFilter !== "all") {
        ticketStatusQuery = ticketStatusQuery.filter((q) =>
          q.eq(q.field("status"), statusFilter),
        );
      }
      if (listFilter !== "all") {
        ticketStatusQuery = ticketStatusQuery.filter((q) =>
          q.eq(q.field("listKey"), listFilter),
        );
      }

      const matching = await ticketStatusQuery.collect();
      return matching.length;
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
  note?: string;
  status: string;
  ticketStatus: "not-issued" | "issued" | "disabled" | "redeemed";
  attendees?: number;
  contact?: {
    email?: string;
    phone?: string;
  };
  customFieldValues: Record<string, string> | undefined;
  redemptionStatus: "none" | "issued" | "redeemed" | "disabled";
  redemptionCode?: string;
  createdAt: number;
  updatedAt: number;
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
    sortBy: v.optional(v.string()),
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
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
      sortBy = "createdAt",
      sortOrder = "desc",
    },
  ): Promise<PaginatedRsvpResult> => {
    const normalizeTicketStatusFilter = (
      filter: string,
    ): "not-issued" | "issued" | "disabled" | "redeemed" | null => {
      if (filter === "not-issued") return "not-issued";
      if (filter === "issued" || filter === "disabled" || filter === "redeemed")
        return filter;
      return null;
    };

    const ticketStatusFilter = normalizeTicketStatusFilter(redemptionFilter);

    // Fetch event once since all RSVPs are for the same event
    const event = await ctx.db.get(eventId);
    if (!event) throw new Error("Event not found");

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
        if (ticketStatusFilter && ticketStatusFilter !== "not-issued") {
          searchQuery = searchQuery.eq("ticketStatus", ticketStatusFilter);
        }
        return searchQuery;
      });
    } else {
      baseQuery = baseQuery.withIndex("by_event", (q: any) =>
        q.eq("eventId", eventId),
      );

      if (statusFilter !== "all") {
        baseQuery = baseQuery.filter((q: any) =>
          q.eq(q.field("status"), statusFilter),
        );
      }

      if (ticketStatusFilter) {
        baseQuery = baseQuery.filter((q: any) => {
          if (ticketStatusFilter === "not-issued") {
            return q.or(
              q.eq(q.field("ticketStatus"), "not-issued"),
              q.eq(q.field("ticketStatus"), undefined),
            );
          }
          return q.eq(q.field("ticketStatus"), ticketStatusFilter);
        });
      }

      if (listFilter !== "all") {
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
      // For non-search queries, apply ordering based on sortBy parameter
      // Only use database ordering for createdAt (indexed field)
      if (sortBy === "createdAt") {
        paginatedResult = await baseQuery.order(sortOrder).paginate({
          cursor: cursor ?? null,
          numItems: pageSize,
        });
      } else {
        // For other fields, fetch without ordering and sort after enrichment
        paginatedResult = await baseQuery.order("desc").paginate({
          cursor: cursor ?? null,
          numItems: pageSize,
        });
      }
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

    // Batch fetch redemption data only for RSVPs with active codes
    const rsvpsNeedingRedemption = paginatedResult.page.filter(
      (rsvp: Doc<"rsvps">) =>
        ((rsvp.ticketStatus as string | undefined) ?? "not-issued") !==
        "not-issued",
    );
    const redemptions = await Promise.all(
      rsvpsNeedingRedemption.map(async (rsvp: Doc<"rsvps">) =>
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
      const ticketStatus =
        (rsvp.ticketStatus as
          | "not-issued"
          | "issued"
          | "disabled"
          | "redeemed") ?? "not-issued";
      let redemptionStatus: "none" | "issued" | "redeemed" | "disabled";
      switch (ticketStatus) {
        case "issued":
          redemptionStatus = "issued";
          break;
        case "disabled":
          redemptionStatus = "disabled";
          break;
        case "redeemed":
          redemptionStatus = "redeemed";
          break;
        case "not-issued":
        default:
          redemptionStatus = "none";
          break;
      }

      // credentialId field has been removed from schema
      // Credential lookups now use listKey only
      const user = userMap[rsvp.clerkUserId];

      // Ensure customFieldValues is always included in the response
      // Return empty object instead of undefined to ensure the field is always present
      // This ensures consistency when using search queries vs regular queries
      const customFieldValues = rsvp.customFieldValues ?? ({} as Record<string, string>);

      return {
        id: rsvp._id,
        clerkUserId: rsvp.clerkUserId,
        name:
          [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
          user?.name ||
          rsvp.userName ||
          "", // PRIORITY: users table (fresh data) → rsvp.userName (fallback)
        firstName:
          user?.firstName || (rsvp.userName ? rsvp.userName.split(" ")[0] : ""),
        lastName:
          user?.lastName ||
          (rsvp.userName ? rsvp.userName.split(" ").slice(1).join(" ") : ""),
        listKey: rsvp.listKey || "",
        note: rsvp.note,
        status: rsvp.status,
        ticketStatus,
        attendees: rsvp.attendees,
        contact: rsvp.shareContact
          ? {
              email: undefined,
              phone: undefined,
            }
          : undefined,
        customFieldValues,
        redemptionStatus,
        redemptionCode: redemption?.code,
        createdAt: rsvp.createdAt,
        updatedAt: rsvp.updatedAt ?? rsvp.createdAt,
        smsConsent: rsvp.smsConsent ?? undefined,
      };
    });

    // Apply listKey filter after enrichment (needed for search queries)
    if (guestSearch.trim() && listFilter !== "all") {
      enrichedPage = enrichedPage.filter(
        (rsvp: EnrichedRsvp) => rsvp.listKey === listFilter,
      );
    }

    if (guestSearch.trim() && ticketStatusFilter) {
      enrichedPage = enrichedPage.filter(
        (rsvp: any) => rsvp.ticketStatus === ticketStatusFilter,
      );
    }

    // Apply sorting after enrichment for non-indexed fields
    // For createdAt, sorting is already applied via database ordering
    if (sortBy !== "createdAt") {
      enrichedPage.sort((a: EnrichedRsvp, b: EnrichedRsvp) => {
        let comparison = 0;
        const directionMultiplier = sortOrder === "asc" ? 1 : -1;

        switch (sortBy) {
          case "updatedAt":
            comparison = a.updatedAt - b.updatedAt;
            break;
          case "name":
            comparison = (a.name || "").localeCompare(b.name || "");
            break;
          case "firstName":
            comparison = (a.firstName || "").localeCompare(b.firstName || "");
            break;
          case "lastName":
            comparison = (a.lastName || "").localeCompare(b.lastName || "");
            break;
          case "status":
            comparison = (a.status || "").localeCompare(b.status || "");
            break;
          case "ticketStatus":
            comparison = (a.ticketStatus || "").localeCompare(b.ticketStatus || "");
            break;
          case "listKey":
            comparison = (a.listKey || "").localeCompare(b.listKey || "");
            break;
          case "attendees":
            comparison = (a.attendees ?? 0) - (b.attendees ?? 0);
            break;
          default:
            // Fallback to createdAt if sortBy is unknown
            comparison = a.createdAt - b.createdAt;
            break;
        }

        // If values are equal, use createdAt as tiebreaker
        if (comparison === 0) {
          comparison = a.createdAt - b.createdAt;
        }

        return directionMultiplier * comparison;
      });
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
      .withIndex("by_event", (query) => query.eq("eventId", eventId))
      .filter((query) => query.eq(query.field("clerkUserId"), clerkUserId))
      .collect();
    if (rsvps.length === 0) return null;

    const chosen = selectPrimaryRsvp(rsvps);

    const listCredential = await resolveListCredential(ctx, eventId, chosen);

    return {
      rsvpId: chosen._id,
      listKey: chosen.listKey,
      status: sanitizeStatus(chosen.status),
      shareContact: chosen.shareContact,
      customFieldValues: chosen.customFieldValues ?? undefined,
      smsConsent: chosen.smsConsent ?? false,
      smsConsentIpAddress: chosen.smsConsentIpAddress ?? undefined,
      generateQR: listCredential?.generateQR ?? false,
    } as const;
  },
});

export const statusForUserEventServer = query({
  args: { eventId: v.id("events"), clerkUserId: v.string() },
  handler: async (ctx, { eventId, clerkUserId }) => {
    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (query) => query.eq("eventId", eventId))
      .filter((query) => query.eq(query.field("clerkUserId"), clerkUserId))
      .collect();
    if (rsvps.length === 0) return null;

    const chosen = selectPrimaryRsvp(rsvps);

    const redemptionInfo = await resolveRedemption(ctx, eventId, clerkUserId, chosen);

    return {
      rsvpId: chosen._id,
      listKey: chosen.listKey,
      status: sanitizeStatus(chosen.status),
      shareContact: chosen.shareContact,
      customFieldValues: chosen.customFieldValues ?? undefined,
      smsConsent: chosen.smsConsent ?? false,
      redemption: redemptionInfo,
    } as const;
  },
});

type RawRsvp = Doc<"rsvps">;

const statusPriority = ["approved", "attending", "pending", "denied"] as const;

function selectPrimaryRsvp(rsvps: RawRsvp[]): RawRsvp {
  const prioritized = [...rsvps].sort((a, b) => {
    const priorityDiff =
      statusPriority.indexOf((b.status as typeof statusPriority[number]) ?? "denied") -
      statusPriority.indexOf((a.status as typeof statusPriority[number]) ?? "denied");
    if (priorityDiff !== 0) return priorityDiff;
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  });
  return prioritized[0];
}

function sanitizeStatus(status: string): "approved" | "pending" | "denied" | "attending" {
  const typedStatus = status as "approved" | "pending" | "denied" | "attending";
  return statusPriority.includes(typedStatus) ? typedStatus : "pending";
}

async function resolveListCredential(
  ctx: any,
  eventId: Id<"events">,
  rsvp: RawRsvp,
) {
  if (!rsvp.listKey) return null;
  return ctx.db
    .query("listCredentials")
    .withIndex("by_event", (query: any) => query.eq("eventId", eventId))
    .filter((query: any) => query.eq(query.field("listKey"), rsvp.listKey))
    .unique();
}

async function resolveRedemption(
  ctx: any,
  eventId: Id<"events">,
  clerkUserId: string,
  rsvp: RawRsvp,
) {
  if (rsvp.status !== "approved" && rsvp.status !== "attending") {
    return null;
  }

  const redemption = await ctx.db
    .query("redemptions")
    .withIndex("by_event_user", (query: any) =>
      query.eq("eventId", eventId).eq("clerkUserId", clerkUserId),
    )
    .unique();

  if (!redemption) return null;

  return {
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
    ticketStatus: v.optional(
      v.union(
        v.literal("not-issued"),
        v.literal("issued"),
        v.literal("disabled"),
        v.literal("redeemed"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const now = args.createdAt || Date.now();
    const rsvpId = await ctx.db.insert("rsvps", {
      eventId: args.eventId,
      clerkUserId: args.clerkUserId,
      listKey: args.listKey,
      ticketStatus: args.ticketStatus ?? "not-issued",
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
        
        // Get redemption code for SMS notification
        const redemption = await ctx.db
          .query("redemptions")
          .withIndex("by_event_user", (q) =>
            q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
          )
          .unique();
        
        // Schedule SMS notification if contact sharing is allowed and redemption exists
        if (redemption && rsvp.shareContact && rsvp.listKey) {
          await ctx.scheduler.runAfter(0, api.notifications.sendApprovalSms, {
            eventId: rsvp.eventId,
            clerkUserId: rsvp.clerkUserId,
            listKey: rsvp.listKey,
            code: redemption.code,
            shareContact: rsvp.shareContact,
          });
        }
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
          await ctx.db.patch(args.rsvpId, {
            ticketStatus: "disabled",
            updatedAt: now,
          });
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

export const backfillTicketStatus = migrations.define({
  table: "rsvps",
  migrateOne: async (ctx, rsvpDoc) => {
    if (rsvpDoc.ticketStatus !== undefined) {
      return;
    }

    const redemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q: any) =>
        q.eq("eventId", rsvpDoc.eventId).eq("clerkUserId", rsvpDoc.clerkUserId),
      )
      .unique();

    let ticketStatus: "not-issued" | "issued" | "disabled" | "redeemed" =
      "not-issued";
    if (redemption) {
      if (redemption.disabledAt) {
        ticketStatus = "disabled";
      } else if (redemption.redeemedAt) {
        ticketStatus = "redeemed";
      } else {
        ticketStatus = "issued";
      }
    }

    await ctx.db.patch(rsvpDoc._id, {
      ticketStatus,
    });
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
            await ctx.db.patch(update.rsvpId, {
              ticketStatus: "disabled",
              updatedAt: now,
            });
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
