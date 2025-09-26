import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "../_generated/api";
import { DataModel } from "../_generated/dataModel";

// Aggregate for efficient RSVP counting with hierarchical key structure
// Key: [eventId, status, listKey] allows filtering by any combination
export const rsvpAggregate = new TableAggregate<{
  Key: [string, string, string]; // [eventId, status, listKey]
  DataModel: DataModel;
  TableName: "rsvps";
}>(components.rsvpAggregate, {
  sortKey: (doc: any) => [
    doc.eventId,
    doc.status || "pending",
    doc.listKey || "unknown",
  ],
});

// Helper functions to keep aggregate in sync with RSVP table changes

export async function insertRsvpIntoAggregate(ctx: any, rsvp: any) {
  console.log(`[AGGREGATE] Inserting RSVP into aggregate:`, {
    eventId: rsvp.eventId,
    status: rsvp.status,
    listKey: rsvp.listKey,
    sortKey: [
      rsvp.eventId,
      rsvp.status || "pending",
      rsvp.listKey || "unknown",
    ],
  });
  await rsvpAggregate.insertIfDoesNotExist(ctx, rsvp);
}

export async function updateRsvpInAggregate(
  ctx: any,
  oldRsvp: any,
  newRsvp: any,
) {
  console.log(`[AGGREGATE] Updating RSVP in aggregate:`, {
    old: {
      eventId: oldRsvp.eventId,
      status: oldRsvp.status,
      listKey: oldRsvp.listKey,
    },
    new: {
      eventId: newRsvp.eventId,
      status: newRsvp.status,
      listKey: newRsvp.listKey,
    },
    oldSortKey: [
      oldRsvp.eventId,
      oldRsvp.status || "pending",
      oldRsvp.listKey || "unknown",
    ],
    newSortKey: [
      newRsvp.eventId,
      newRsvp.status || "pending",
      newRsvp.listKey || "unknown",
    ],
  });
  await rsvpAggregate.replace(ctx, oldRsvp, newRsvp);
}

export async function deleteRsvpFromAggregate(ctx: any, rsvp: any) {
  console.log(`[AGGREGATE] Deleting RSVP from aggregate:`, {
    eventId: rsvp.eventId,
    status: rsvp.status,
    listKey: rsvp.listKey,
    sortKey: [
      rsvp.eventId,
      rsvp.status || "pending",
      rsvp.listKey || "unknown",
    ],
  });
  await rsvpAggregate.delete(ctx, rsvp);
}

// Test function to check if aggregate is working
export async function testAggregateHealth(ctx: any, eventId: string) {
  try {
    // Try to get total count for the event
    const totalCount = await rsvpAggregate.count(ctx, {
      bounds: {
        lower: { key: [eventId, "", ""], inclusive: true },
        upper: { key: [eventId, "\uFFFF", "\uFFFF"], inclusive: true },
      },
    });

    // Also try to get total count across all events
    const globalCount = await rsvpAggregate.count(ctx, {
      bounds: {
        lower: { key: ["", "", ""], inclusive: true },
        upper: { key: ["\uFFFF", "\uFFFF", "\uFFFF"], inclusive: true },
      },
    });

    console.log(
      `[AGGREGATE HEALTH] Event ${eventId} count: ${totalCount}, Global count: ${globalCount}`,
    );

    return { eventCount: totalCount, globalCount };
  } catch (error) {
    console.error(`[AGGREGATE HEALTH] Failed to test aggregate:`, error);
    throw error;
  }
}

// Count function that uses the aggregate for efficient filtering
export async function countRsvpsWithAggregate(
  ctx: any,
  eventId: string,
  statusFilter: string = "all",
  listFilter: string = "all",
) {
  try {
    let result: number;

    if (statusFilter === "all" && listFilter === "all") {
      // Count all RSVPs for this event
      const bounds = {
        lower: { key: [eventId, "", ""] as [string, string, string], inclusive: true },
        upper: { key: [eventId, "\uFFFF", "\uFFFF"] as [string, string, string], inclusive: true },
      };
      result = await rsvpAggregate.count(ctx, { namespace: undefined, bounds });
    } else if (statusFilter !== "all" && listFilter === "all") {
      // Count by event + status, any listKey
      const bounds = {
        lower: { key: [eventId, statusFilter, ""] as [string, string, string], inclusive: true },
        upper: { key: [eventId, statusFilter, "\uFFFF"] as [string, string, string], inclusive: true },
      };
      result = await rsvpAggregate.count(ctx, { namespace: undefined, bounds });
    } else if (statusFilter === "all" && listFilter !== "all") {
      // Count by event + listKey, any status - need to sum across statuses
      const statuses = ["pending", "approved", "denied"];
      let totalCount = 0;

      for (const status of statuses) {
        const bounds = {
          lower: { key: [eventId, status, listFilter] as [string, string, string], inclusive: true },
          upper: { key: [eventId, status, listFilter] as [string, string, string], inclusive: true },
        };
        const count = await rsvpAggregate.count(ctx, { namespace: undefined, bounds });
        totalCount += count;
      }

      result = totalCount;
    } else {
      // Count by event + status + listKey (most specific)
      const bounds = {
        lower: { key: [eventId, statusFilter, listFilter] as [string, string, string], inclusive: true },
        upper: { key: [eventId, statusFilter, listFilter] as [string, string, string], inclusive: true },
      };
      result = await rsvpAggregate.count(ctx, { namespace: undefined, bounds });
    }

    // If we expect RSVPs but get 0, fallback to direct DB count
    if (result === 0) {
      console.warn(
        `[AGGREGATE] Count returned 0 for event ${eventId}. Falling back to direct DB count.`,
      );

      // Fallback to direct database count
      let fallbackQuery = ctx.db
        .query("rsvps")
        .withIndex("by_event", (q: any) => q.eq("eventId", eventId));

      if (statusFilter !== "all") {
        fallbackQuery = fallbackQuery.filter((q: any) =>
          q.eq(q.field("status"), statusFilter),
        );
      }
      if (listFilter !== "all") {
        fallbackQuery = fallbackQuery.filter((q: any) =>
          q.eq(q.field("listKey"), listFilter),
        );
      }

      const fallbackCount = await fallbackQuery
        .collect()
        .then((results: any) => results.length);
      console.log(`[AGGREGATE] Fallback DB count: ${fallbackCount}`);

      // If DB has RSVPs but aggregate doesn't, the aggregate needs to be populated
      if (fallbackCount > 0) {
        console.error(
          `[AGGREGATE] Found ${fallbackCount} RSVPs in DB but 0 in aggregate. Aggregate needs to be populated!`,
        );
        throw new Error(
          `Aggregate is empty but database has ${fallbackCount} RSVPs. Aggregate needs to be populated.`,
        );
      }

      return fallbackCount;
    }

    return result;
  } catch (error) {
    console.error(`[AGGREGATE] Error counting RSVPs:`, error);
    throw new Error(
      `Aggregate count failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

