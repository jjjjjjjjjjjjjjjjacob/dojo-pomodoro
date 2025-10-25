import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    // Temporarily optional to run migration; switch back to v.string() after.
    clerkUserId: v.optional(v.string()),
    phone: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
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
    secondaryTitle: v.optional(v.string()),
    hosts: v.array(v.string()), // host emails (Clerk) or user IDs later
    location: v.string(),
    flyerUrl: v.optional(v.string()),
    flyerStorageId: v.optional(v.id("_storage")),
    customIconStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    guestPortalImageStorageId: v.optional(v.id("_storage")),
    guestPortalLinkLabel: v.optional(v.string()),
    guestPortalLinkUrl: v.optional(v.string()),
    eventDate: v.number(), // ms since epoch
    eventTimezone: v.optional(v.string()),
    isFeatured: v.optional(v.boolean()), // one event can be featured for home page redirect
    status: v.optional(v.string()),
    maxAttendees: v.optional(v.number()), // maximum attendees allowed per RSVP (default 1)
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_featured", ["isFeatured"]) // for quick featured event lookup
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
    .index("by_fingerprint", ["passwordFingerprint"])
    .index("by_event_key", ["eventId", "listKey"]), // NEW: for migration lookups

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
    listKey: v.string(), // Primary reference to list credentials
    userName: v.optional(v.string()), // Denormalized from users table
    shareContact: v.boolean(),
    note: v.optional(v.string()),
    attendees: v.optional(v.number()), // total number of attendees including RSVP person (default 1)
    smsConsent: v.optional(v.boolean()), // whether user consented to SMS notifications
    smsConsentTimestamp: v.optional(v.number()), // when SMS consent was given/withdrawn
    smsConsentIpAddress: v.optional(v.string()), // IP address when consent was given for compliance
    customFieldValues: v.optional(v.record(v.string(), v.string())),
    status: v.string(), // 'pending' | 'approved' | 'denied' | 'attending
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event", ["eventId"]) // host view
    .index("by_user", ["clerkUserId"]) // user lookup
    .index("by_event_user", ["eventId", "clerkUserId"])
    // NEW indexes for efficient filtering
    .index("by_event_status", ["eventId", "status"])
    .searchIndex("search_text", {
      searchField: "userName",
      filterFields: ["eventId", "status", "listKey"],
    }),

  approvals: defineTable({
    eventId: v.id("events"),
    rsvpId: v.id("rsvps"),
    clerkUserId: v.string(),
    listKey: v.string(), // Primary reference to list credentials
    decision: v.string(), // 'approved' | 'denied'
    decidedBy: v.string(), // clerkUserId of host
    decidedAt: v.number(),
    denialReason: v.optional(v.string()),
  }).index("by_event", ["eventId"]),

  redemptions: defineTable({
    eventId: v.id("events"),
    clerkUserId: v.string(),
    listKey: v.string(), // Primary reference to list credentials
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

  // SMS notifications tracking
  smsNotifications: defineTable({
    eventId: v.id("events"),
    recipientClerkUserId: v.string(),
    recipientPhoneObfuscated: v.string(), // ***-***-1234 format for display
    type: v.string(), // 'approval' | 'blast' | 'reminder'
    message: v.string(),
    status: v.string(), // 'pending' | 'sent' | 'failed'
    messageId: v.optional(v.string()), // AWS SNS MessageId
    errorMessage: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_user", ["recipientClerkUserId"])
    .index("by_status", ["status"])
    .index("by_type", ["type"]),

  // Text blast campaigns
  textBlasts: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    message: v.string(),
    targetLists: v.array(v.string()), // ['vip', 'ga', etc.]
    recipientCount: v.number(),
    sentCount: v.number(),
    failedCount: v.number(),
    sentBy: v.string(), // clerkUserId of host who sent
    scheduledFor: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    status: v.string(), // 'draft' | 'sending' | 'sent' | 'failed'
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_status", ["status"])
    .index("by_sent_by", ["sentBy"]),

  // SMS usage tracking for cost monitoring and analytics
  smsUsageLogs: defineTable({
    messageId: v.string(), // AWS SNS Message ID
    phoneNumber: v.string(), // Obfuscated for privacy
    messageLength: v.number(),
    messageType: v.string(), // 'Transactional' | 'Promotional'
    estimatedCost: v.number(), // Cost in USD
    actualCost: v.optional(v.number()), // If available from AWS billing
    timestamp: v.number(),
    status: v.optional(v.string()), // 'delivered' | 'failed' | 'unknown'
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_message_type", ["messageType"])
    .index("by_cost", ["estimatedCost"]),

  // SMS opt-outs and preferences
  smsOptOuts: defineTable({
    phoneNumber: v.string(), // Hashed for privacy
    clerkUserId: v.optional(v.string()),
    optedOutAt: v.number(),
    reason: v.optional(v.string()), // 'user_request' | 'carrier_block' | 'invalid_number'
    reOptInAt: v.optional(v.number()),
  })
    .index("by_phone", ["phoneNumber"])
    .index("by_user", ["clerkUserId"]),
});
