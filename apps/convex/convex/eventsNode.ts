"use node";
import { action, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { hmacFingerprint, hashPassword } from "./lib/passwordUtils";
import {
  ValidationError,
  DuplicateError,
  NotFoundError,
  type EventPatch,
  type ListUpdate,
  type CredentialData,
} from "./lib/types";
import type { Doc } from "./_generated/dataModel";

const HEX_COLOR_PATTERN = /^#(?:[0-9A-Fa-f]{6})$/;

function normalizeOptionalHexColor(
  input: string | null | undefined,
  validationLabel: string,
): string | undefined {
  if (!input) return undefined;
  const trimmedInput = input.trim();
  if (trimmedInput.length === 0) return undefined;
  const prefixedInput = trimmedInput.startsWith("#")
    ? trimmedInput
    : `#${trimmedInput}`;
  if (!HEX_COLOR_PATTERN.test(prefixedInput)) {
    throw new ValidationError(
      `${validationLabel} must be a 6-digit hex color (e.g. #FF0000)`,
    );
  }
  return `#${prefixedInput.slice(1).toUpperCase()}`;
}

export const create = action({
  args: {
    name: v.string(),
    secondaryTitle: v.optional(v.string()),
    hosts: v.array(v.string()),
    location: v.string(),
    flyerUrl: v.optional(v.string()),
    flyerStorageId: v.optional(v.id("_storage")),
    customIconStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    eventDate: v.number(),
    eventTimezone: v.optional(v.string()),
    maxAttendees: v.optional(v.number()),
    lists: v.array(
      v.object({
        listKey: v.string(),
        password: v.string(),
        generateQR: v.optional(v.boolean()),
      }),
    ),
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
  handler: async (ctx, args): Promise<any> => {
    const now = Date.now();
    if (args.eventDate < now)
      throw new Error("Event date must be in the future");

    // Validate maxAttendees
    if (args.maxAttendees !== undefined) {
      if (args.maxAttendees < 1 || args.maxAttendees > 6) {
        throw new Error("Maximum attendees must be between 1 and 6");
      }
    }

    const localFingerprints = new Set<string>();
    const fingerprintSecret = process.env.FINGERPRINT_SECRET as
      | string
      | undefined;
    if (!fingerprintSecret) throw new Error("Missing FINGERPRINT_SECRET env");

    for (const { password } of args.lists) {
      const fingerprint = hmacFingerprint(fingerprintSecret, password);
      if (localFingerprints.has(fingerprint))
        throw new ValidationError(
          "List passwords must be unique within the event",
        );
      localFingerprints.add(fingerprint);
    }

    // Enforce uniqueness across upcoming events
    for (const { password } of args.lists) {
      const fingerprint = hmacFingerprint(fingerprintSecret, password);
      const credentials = await ctx.runQuery(api.credentials.getByFingerprint, {
        fingerprint,
      });
      if (credentials.length > 0) {
        for (const credential of credentials) {
          const event = await ctx.runQuery(api.events.get, {
            eventId: credential.eventId,
          });
          if (event && event.eventDate > now)
            throw new DuplicateError(
              "Password already in use by an upcoming event",
            );
        }
      }
    }

    const derivedCredentials: CredentialData[] = args.lists.map(
      ({ listKey, password, generateQR }) => {
        const { saltB64, hashB64, iterations } = hashPassword(password);
        const fingerprint = hmacFingerprint(fingerprintSecret, password);
        return {
          listKey,
          passwordHash: hashB64,
          passwordSalt: saltB64,
          passwordIterations: iterations,
          passwordFingerprint: fingerprint,
          generateQR,
        };
      },
    );

    const normalizedThemeBackgroundColor = normalizeOptionalHexColor(
      args.themeBackgroundColor,
      "Background color",
    );
    const normalizedThemeTextColor = normalizeOptionalHexColor(
      args.themeTextColor,
      "Text color",
    );

    const result = await ctx.runMutation(api.events.insertWithCreds, {
      name: args.name,
      secondaryTitle: args.secondaryTitle,
      hosts: args.hosts,
      location: args.location,
      flyerUrl: args.flyerUrl,
      flyerStorageId: args.flyerStorageId,
      customIconStorageId: args.customIconStorageId ?? null,
      eventDate: args.eventDate,
      eventTimezone: args.eventTimezone,
      maxAttendees: args.maxAttendees ?? 1,
      customFields: args.customFields,
      themeBackgroundColor: normalizedThemeBackgroundColor,
      themeTextColor: normalizedThemeTextColor,
      creds: derivedCredentials,
    });
    return result;
  },
});

export const update = action({
  args: {
    eventId: v.id("events"),
    patch: v.optional(
      v.object({
        name: v.optional(v.string()),
        secondaryTitle: v.optional(v.string()),
        hosts: v.optional(v.array(v.string())),
        location: v.optional(v.string()),
        flyerStorageId: v.optional(v.id("_storage")),
        customIconStorageId: v.optional(v.union(v.id("_storage"), v.null())),
        eventDate: v.optional(v.number()),
        eventTimezone: v.optional(v.string()),
        maxAttendees: v.optional(v.number()),
        status: v.optional(v.string()),
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
      }),
    ),
    lists: v.optional(
      v.array(
        v.object({
          id: v.optional(v.id("listCredentials")),
          listKey: v.string(),
          password: v.optional(v.string()),
        }),
      ),
    ),
  },
  handler: async (ctx, args): Promise<any> => {
    const { eventId, patch, lists } = args;

    // Update event base fields via mutation to keep server/runtime separation
    if (patch && Object.keys(patch).length > 0) {
      const sanitizedPatch: EventPatch = { ...patch };
      if (patch.themeBackgroundColor !== undefined) {
        sanitizedPatch.themeBackgroundColor = normalizeOptionalHexColor(
          patch.themeBackgroundColor,
          "Background color",
        );
      }
      if (patch.themeTextColor !== undefined) {
        sanitizedPatch.themeTextColor = normalizeOptionalHexColor(
          patch.themeTextColor,
          "Text color",
        );
      }
      if (patch.customIconStorageId !== undefined) {
        sanitizedPatch.customIconStorageId = patch.customIconStorageId ?? null;
      }
      await ctx.runMutation(api.events.update, { eventId, ...sanitizedPatch });
    }

    if (!lists) return { ok: true as const };

    // Fetch current credentials for event
    const existingCredentials = await ctx.runQuery(
      api.credentials.getCredsForEvent,
      { eventId },
    );
    const existingById = new Map<string, Doc<"listCredentials">>(
      existingCredentials.map((credential: Doc<"listCredentials">) => [
        credential._id,
        credential,
      ]),
    );

    // For deletions: any existing not present in incoming by id
    const incomingIds = new Set(lists.map((list) => list.id).filter(Boolean));
    for (const credential of existingCredentials) {
      if (!incomingIds.has(credential._id)) {
        await ctx.runMutation(api.events.removeListCredential, {
          id: credential._id,
        });
      }
    }

    // Process upserts/updates
    const fingerprintSecret = process.env.FINGERPRINT_SECRET as
      | string
      | undefined;
    if (!fingerprintSecret)
      throw new ValidationError("Missing FINGERPRINT_SECRET env");

    for (const list of lists) {
      const currentCredential = list.id ? existingById.get(list.id) : undefined;
      const wantsPasswordUpdate = list.password && list.password.length > 0;
      type ListCredentialPatch = Partial<
        Pick<
          Doc<"listCredentials">,
          | "listKey"
          | "passwordHash"
          | "passwordSalt"
          | "passwordIterations"
          | "passwordFingerprint"
        >
      >;
      const credentialPatch: ListCredentialPatch = {};

      if (currentCredential) {
        if (list.listKey !== currentCredential.listKey) {
          credentialPatch.listKey = list.listKey;
        }
        if (wantsPasswordUpdate) {
          // Derive new secret material
          const { saltB64, hashB64, iterations } = hashPassword(list.password!);
          const fingerprint = hmacFingerprint(
            fingerprintSecret,
            list.password!,
          );

          // Enforce uniqueness across active events excluding this credential
          const matchingCredentials = await ctx.runQuery(
            api.credentials.getByFingerprint,
            { fingerprint },
          );
          for (const matchingCredential of matchingCredentials) {
            if (matchingCredential._id === currentCredential._id) continue;
            const event = await ctx.runQuery(api.events.get, {
              eventId: matchingCredential.eventId,
            });
            if (event && event.status === "active") {
              throw new DuplicateError(
                "Password already in use by an active event",
              );
            }
          }

          credentialPatch.passwordHash = hashB64;
          credentialPatch.passwordSalt = saltB64;
          credentialPatch.passwordIterations = iterations;
          credentialPatch.passwordFingerprint = fingerprint;
        }
        if (Object.keys(credentialPatch).length > 0) {
          await ctx.runMutation(api.events.updateListCredential, {
            id: currentCredential._id,
            patch: credentialPatch,
          });
        }
      } else {
        // New credential - require password
        if (!wantsPasswordUpdate) continue; // skip if no password provided
        const { saltB64, hashB64, iterations } = hashPassword(list.password!);
        const fingerprint = hmacFingerprint(fingerprintSecret, list.password!);
        const matchingCredentials = await ctx.runQuery(
          api.credentials.getByFingerprint,
          { fingerprint },
        );
        for (const matchingCredential of matchingCredentials) {
          const event = await ctx.runQuery(api.events.get, {
            eventId: matchingCredential.eventId,
          });
          if (event && event.status === "active") {
            throw new DuplicateError(
              "Password already in use by an active event",
            );
          }
        }
        await ctx.runMutation(api.events.addListCredential, {
          eventId,
          listKey: list.listKey,
          passwordHash: hashB64,
          passwordSalt: saltB64,
          passwordIterations: iterations,
          passwordFingerprint: fingerprint,
        });
      }
    }

    return { ok: true as const };
  },
});
