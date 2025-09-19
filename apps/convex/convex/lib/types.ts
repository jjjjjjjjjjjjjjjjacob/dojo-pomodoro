import { Doc, Id } from "../_generated/dataModel";

/**
 * Custom error types for better error handling
 */
export class ConvexError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "ConvexError";
  }
}

export class ValidationError extends ConvexError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class NotFoundError extends ConvexError {
  constructor(resource: string) {
    super(`${resource} not found`, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class DuplicateError extends ConvexError {
  constructor(resource: string) {
    super(`${resource} already exists`, "DUPLICATE");
    this.name = "DuplicateError";
  }
}

/**
 * Type-safe API response types
 */
export type ApiResult<T> = {
  ok: true;
  data?: T;
} | {
  ok: false;
  error: string;
};

/**
 * Event patch type for better type safety
 */
export type EventPatch = Partial<Pick<Doc<"events">,
  "name" | "hosts" | "location" | "flyerUrl" | "flyerStorageId" | "eventDate" | "status" | "customFields"
>>;

/**
 * List credential patch type
 */
export type ListCredentialPatch = Partial<Pick<Doc<"listCredentials">,
  "listKey" | "passwordHash" | "passwordSalt" | "passwordIterations" | "passwordFingerprint"
>>;

/**
 * List update type for events
 */
export type ListUpdate = {
  id?: Id<"listCredentials">;
  listKey: string;
  password?: string;
};

/**
 * Credential data for event creation
 */
export type CredentialData = {
  listKey: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  passwordFingerprint: string;
  generateQR?: boolean;
};