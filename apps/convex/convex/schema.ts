import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    // Temporarily optional to run migration; switch back to v.string() after.
    clerkUserId: v.optional(v.string()),
    phone: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_clerkUserId", ["clerkUserId"]),

  orgMemberships: defineTable({
    clerkUserId: v.string(),
    organizationId: v.string(),
    role: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["clerkUserId"])
    .index("by_org", ["organizationId"]),

  // Events & guest list credentials
  events: defineTable({
    name: v.string(),
    hosts: v.array(v.string()), // host emails (Clerk) or user IDs later
    location: v.string(),
    flyerUrl: v.optional(v.string()),
    flyerStorageId: v.optional(v.id("_storage")),
    eventDate: v.number(), // ms since epoch
    status: v.string(), // 'active' | 'past'
    maxAttendees: v.optional(v.number()), // maximum attendees allowed per RSVP (default 1)
    customFields: v.optional(
      v.array(
        v.object({
          key: v.string(),
          label: v.string(),
          placeholder: v.optional(v.string()),
          required: v.optional(v.boolean()),
          copyEnabled: v.optional(v.boolean()),
        }),
      ),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"]) // for active/past checks
    .index("by_date", ["eventDate"]),

  listCredentials: defineTable({
    eventId: v.id("events"),
    listKey: v.string(), // e.g., 'vip', 'ga'
    passwordHash: v.string(), // base64
    passwordSalt: v.string(), // base64
    passwordIterations: v.number(), // pbkdf2 iterations
    passwordFingerprint: v.string(), // HMAC-SHA256 hex/base64
    generateQR: v.optional(v.boolean()), // whether to generate QR codes for this list
    createdAt: v.number(),
  })
    .index("by_event", ["eventId"]) // lookup for a given event
    .index("by_fingerprint", ["passwordFingerprint"]),

  profiles: defineTable({
    clerkUserId: v.string(),
    phoneEnc: v.optional(
      v.object({ ivB64: v.string(), ctB64: v.string(), tagB64: v.string() }),
    ),
    phoneObfuscated: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["clerkUserId"]),

  rsvps: defineTable({
    eventId: v.id("events"),
    clerkUserId: v.string(),
    listKey: v.string(),
    shareContact: v.boolean(),
    note: v.optional(v.string()),
    attendees: v.optional(v.number()), // total number of attendees including RSVP person (default 1)
    status: v.string(), // 'pending' | 'approved' | 'denied' | 'attending
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event", ["eventId"]) // host view
    .index("by_user", ["clerkUserId"]) // user lookup
    .index("by_event_user", ["eventId", "clerkUserId"]),

  approvals: defineTable({
    eventId: v.id("events"),
    rsvpId: v.id("rsvps"),
    clerkUserId: v.string(),
    listKey: v.string(),
    decision: v.string(), // 'approved' | 'denied'
    decidedBy: v.string(), // clerkUserId of host
    decidedAt: v.number(),
    denialReason: v.optional(v.string()),
  }).index("by_event", ["eventId"]),

  redemptions: defineTable({
    eventId: v.id("events"),
    clerkUserId: v.string(),
    listKey: v.string(),
    code: v.string(), // url-safe token
    createdAt: v.number(),
    disabledAt: v.optional(v.number()),
    redeemedAt: v.optional(v.number()),
    redeemedByClerkUserId: v.optional(v.string()), // clerkUserId of redeemer (host/door)
    unredeemHistory: v.array(
      v.object({
        at: v.number(),
        byClerkUserId: v.string(),
        reason: v.optional(v.string()),
      }),
    ),
  })
    .index("by_code", ["code"]) // unique lookup
    .index("by_event_user", ["eventId", "clerkUserId"]), // ensure one redemption per user/event
});
