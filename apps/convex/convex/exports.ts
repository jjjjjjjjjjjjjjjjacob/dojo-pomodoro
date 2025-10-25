"use node";
import { action } from "./functions";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { createClerkClient } from "@clerk/backend";
import type { ActionCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
import type { UserIdentity } from "convex/server";
import type { ExportContext } from "./exportsQueries";

type ExportRsvpRow = {
  listKey: string;
  name: string;
  attendees: number;
  note: string;
  customFieldValues: Record<string, string>;
  phoneNumber: string;
};

type AdminIdentity = UserIdentity & {
  role?: string;
};

type ExportRsvpsCsvArgs = {
  eventId: Id<"events">;
  listKeys?: string[];
  statusFilters?: Array<Doc<"rsvps">["status"]>;
  includeAttendees?: boolean;
  includeNote?: boolean;
  includeCustomFields?: boolean;
  includePhone?: boolean;
  exportTimestamp?: string;
};

type ExportRsvpsCsvResult = {
  csvContent: string;
  filename: string;
};

export const exportRsvpsCsv = action({
  args: {
    eventId: v.id("events"),
    listKeys: v.optional(v.array(v.string())),
    statusFilters: v.optional(v.array(v.string())),
    includeAttendees: v.optional(v.boolean()),
    includeNote: v.optional(v.boolean()),
    includeCustomFields: v.optional(v.boolean()),
    includePhone: v.optional(v.boolean()),
    exportTimestamp: v.optional(v.string()),
  },
  handler: async (
    ctx: ActionCtx,
    {
      eventId,
      listKeys,
      statusFilters,
      includeAttendees = true,
      includeNote = true,
      includeCustomFields = true,
      includePhone = true,
      exportTimestamp,
    }: ExportRsvpsCsvArgs,
  ): Promise<ExportRsvpsCsvResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const role = (identity as AdminIdentity).role;
    if (role !== "org:admin") throw new Error("Forbidden: admin role required");

    const {
      event,
      rsvps,
      listCredentials,
      usersByClerkUserId,
      profilesByClerkUserId,
    }: ExportContext = await ctx.runQuery(
      internal.exportsQueries.getRsvpsForExportInternal,
      {
        eventId,
        listKeys,
        statusFilters,
      },
    );

    const listKeyToName: Record<string, string> = Object.fromEntries(
      listCredentials.map((credential) => [
        credential.listKey,
        credential.listKey,
      ] as const),
    );

    const decryptedPhoneCache = new Map<string, string | null>();
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    let clerkClient: ReturnType<typeof createClerkClient> | null = null;

    const resolvePhoneForUser = async (
      clerkUserId: string,
    ): Promise<string | null> => {
      if (decryptedPhoneCache.has(clerkUserId)) {
        return decryptedPhoneCache.get(clerkUserId) ?? null;
      }

      let resolvedPhone: string | null = null;
      const profile = profilesByClerkUserId[clerkUserId];

      if (profile?.phoneEnc) {
        try {
          resolvedPhone = await ctx.runAction(
            internal.profilesNode.decryptPhoneInternal,
            {
              phoneEnc: profile.phoneEnc,
            },
          );
        } catch (error) {
          console.error(
            `[EXPORT] Failed to decrypt phone for user ${clerkUserId}:`,
            error,
          );
        }
      }

      if (!resolvedPhone && clerkSecretKey) {
        try {
          if (!clerkClient) {
            clerkClient = createClerkClient({ secretKey: clerkSecretKey });
          }
          const clerkUser = await clerkClient.users.getUser(clerkUserId);
          const preferredPhone =
            (clerkUser.primaryPhoneNumberId &&
              clerkUser.phoneNumbers.find(
                (phone) => phone.id === clerkUser.primaryPhoneNumberId,
              )?.phoneNumber) ||
            clerkUser.phoneNumbers[0]?.phoneNumber;
          if (preferredPhone) {
            resolvedPhone = preferredPhone;
          }
        } catch (error) {
          console.error(
            `[EXPORT] Failed to fetch phone from Clerk for user ${clerkUserId}:`,
            error,
          );
        }
      }

      if (!resolvedPhone) {
        const userRecord = usersByClerkUserId[clerkUserId];
        if (userRecord?.phone) {
          resolvedPhone = userRecord.phone;
        }
      }

      decryptedPhoneCache.set(clerkUserId, resolvedPhone ?? null);
      return resolvedPhone;
    };

    const enrichedRsvps: ExportRsvpRow[] = [];

    for (const rsvp of rsvps) {
      const userRecord = usersByClerkUserId[rsvp.clerkUserId];
      const firstName = userRecord?.firstName ?? "";
      const lastName = userRecord?.lastName ?? "";
      const metadataName = userRecord?.metadata?.name ?? "";
      const fullName =
        [firstName, lastName]
          .filter((segment) => segment && segment.length > 0)
          .join(" ") ||
        metadataName ||
        rsvp.userName ||
        "";

      let phoneNumber = "";
      if (includePhone && rsvp.shareContact) {
        const resolvedPhone = await resolvePhoneForUser(rsvp.clerkUserId);
        phoneNumber = resolvedPhone ?? "";
      }

      enrichedRsvps.push({
        listKey: rsvp.listKey,
        name: fullName,
        attendees: rsvp.attendees ?? 1,
        note: rsvp.note || "",
        customFieldValues: rsvp.customFieldValues ?? {},
        phoneNumber,
      });
    }

    enrichedRsvps.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );

    const customFieldKeys = includeCustomFields
      ? (event.customFields ?? []).map((field) => field.key)
      : [];
    const customFieldLabels = includeCustomFields
      ? (event.customFields ?? []).map((field) => field.label)
      : [];

    const groupedByList = enrichedRsvps.reduce<Record<string, ExportRsvpRow[]>>(
      (accumulator, rsvp) => {
        if (!accumulator[rsvp.listKey]) {
          accumulator[rsvp.listKey] = [];
        }
        accumulator[rsvp.listKey]!.push(rsvp);
        return accumulator;
      },
      {},
    );

    const csvSections: string[] = [];
    const exportTimestampText =
      exportTimestamp || new Date().toISOString();

    for (const listKey of Object.keys(groupedByList)) {
      const rsvps = groupedByList[listKey] ?? [];
      const listName = listKeyToName[listKey] || listKey;

      csvSections.push(`Event: ${event.name}`);
      csvSections.push(`List: ${listName.toUpperCase()}`);
      csvSections.push(`Export Date: ${exportTimestampText}`);
      csvSections.push("");

      const headerRow: string[] = ["Name"];
      if (includePhone) headerRow.push("Phone");
      if (includeAttendees) headerRow.push("Attendees");
      if (includeNote) headerRow.push("Note");
      if (includeCustomFields) headerRow.push(...customFieldLabels);

      csvSections.push(headerRow.map(escapeCsvField).join(","));

      for (const rsvp of rsvps) {
        const row: string[] = [rsvp.name];
        if (includePhone) row.push(rsvp.phoneNumber);
        if (includeAttendees) row.push(String(rsvp.attendees));
        if (includeNote) row.push(rsvp.note);
        if (includeCustomFields) {
          const customFieldValues = customFieldKeys.map(
            (key) => rsvp.customFieldValues?.[key] || "",
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

    const filenameSafeEventName: string = event.name.replace(/[^a-z0-9]/gi, "_");
    return {
      csvContent: csvSections.join("\n"),
      filename: `${filenameSafeEventName}_rsvps_${Date.now()}.csv`,
    };
  },
});

function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
