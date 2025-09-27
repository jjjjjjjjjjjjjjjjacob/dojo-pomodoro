import { query } from "./functions";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const exportRsvpsCsv = query({
  args: {
    eventId: v.id("events"),
    listKeys: v.optional(v.array(v.string())),
    includeAttendees: v.optional(v.boolean()),
    includeNote: v.optional(v.boolean()),
    includeCustomFields: v.optional(v.boolean()),
    exportTimestamp: v.optional(v.string()),
  },
  handler: async (ctx, {
    eventId,
    listKeys,
    includeAttendees = true,
    includeNote = true,
    includeCustomFields = true,
    exportTimestamp,
  }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const role = (identity as any).role;
    const hasAdminRole = role === "org:admin";
    if (!hasAdminRole) throw new Error("Forbidden: admin role required");

    const event = await ctx.db.get(eventId);
    if (!event) throw new Error("Event not found");

    let approvedRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event_status", (q) =>
        q.eq("eventId", eventId).eq("status", "approved"),
      )
      .collect();

    if (listKeys && listKeys.length > 0) {
      approvedRsvps = approvedRsvps.filter((rsvp) =>
        listKeys.includes(rsvp.listKey)
      );
    }

    const enrichedRsvps = await Promise.all(
      approvedRsvps.map(async (rsvp) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerkUserId", (q) =>
            q.eq("clerkUserId", rsvp.clerkUserId),
          )
          .unique();

        const firstName = user?.firstName || "";
        const lastName = user?.lastName || "";
        const fullName = [firstName, lastName].filter(Boolean).join(" ");

        return {
          listKey: rsvp.listKey,
          name: fullName,
          attendees: rsvp.attendees ?? 1,
          note: rsvp.note || "",
          metadata: user?.metadata || {},
        };
      }),
    );

    const listCredentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    const listKeyToName = Object.fromEntries(
      listCredentials.map((cred) => [cred.listKey, cred.listKey]),
    );

    const groupedByList = enrichedRsvps.reduce(
      (acc, rsvp) => {
        if (!acc[rsvp.listKey]) {
          acc[rsvp.listKey] = [];
        }
        acc[rsvp.listKey].push(rsvp);
        return acc;
      },
      {} as Record<string, typeof enrichedRsvps>,
    );

    const customFieldKeys = includeCustomFields
      ? (event.customFields || []).map((field) => field.key)
      : [];
    const customFieldLabels = includeCustomFields
      ? (event.customFields || []).map((field) => field.label)
      : [];

    const csvSections: string[] = [];

    for (const [listKey, rsvps] of Object.entries(groupedByList)) {
      const listName = listKeyToName[listKey] || listKey;

      csvSections.push(`Event: ${event.name}`);
      csvSections.push(`List: ${listName.toUpperCase()}`);
      csvSections.push(`Export Date: ${exportTimestamp || new Date().toISOString()}`);
      csvSections.push("");

      const headerRow = ["Name"];
      if (includeAttendees) headerRow.push("Attendees");
      if (includeNote) headerRow.push("Note");
      if (includeCustomFields) headerRow.push(...customFieldLabels);

      csvSections.push(headerRow.map(escapeCsvField).join(","));

      for (const rsvp of rsvps) {
        const row = [rsvp.name];
        if (includeAttendees) row.push(String(rsvp.attendees));
        if (includeNote) row.push(rsvp.note);
        if (includeCustomFields) {
          const customFieldValues = customFieldKeys.map(
            (key) => rsvp.metadata[key] || "",
          );
          row.push(...customFieldValues);
        }
        csvSections.push(row.map(escapeCsvField).join(","));
      }

      csvSections.push("");
      csvSections.push("");
      csvSections.push("=".repeat(80));
      csvSections.push("");
    }

    return {
      csvContent: csvSections.join("\n"),
      filename: `${event.name.replace(/[^a-z0-9]/gi, "_")}_rsvps_${new Date().getTime()}.csv`,
    };
  },
});

function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}