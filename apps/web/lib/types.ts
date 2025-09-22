import { Id } from "@convex/_generated/dataModel";

// Core domain interfaces based on Convex schema
export interface User {
  _id: Id<"users">;
  clerkUserId?: string;
  phone?: string;
  name?: string;
  imageUrl?: string;
  metadata?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface OrgMembership {
  _id: Id<"orgMemberships">;
  clerkUserId: string;
  organizationId: string;
  role: string;
  createdAt: number;
  updatedAt: number;
}

export interface CustomField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  copyEnabled?: boolean;
}

export interface Event {
  _id: Id<"events">;
  name: string;
  hosts: string[];
  location: string;
  flyerUrl?: string;
  flyerStorageId?: Id<"_storage">;
  eventDate: number;
  maxAttendees?: number;
  status: "active" | "past";
  customFields?: CustomField[];
  createdAt: number;
  updatedAt: number;
}

export interface ListCredential {
  _id: Id<"listCredentials">;
  eventId: Id<"events">;
  listKey: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  passwordFingerprint: string;
  generateQR?: boolean;
  createdAt: number;
}

export interface Profile {
  _id: Id<"profiles">;
  clerkUserId: string;
  phoneEnc?: {
    ivB64: string;
    ctB64: string;
    tagB64: string;
  };
  phoneObfuscated?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RSVP {
  _id: Id<"rsvps">;
  eventId: Id<"events">;
  clerkUserId: string;
  listKey: string;
  shareContact: boolean;
  note?: string;
  attendees?: number;
  status: "pending" | "approved" | "denied" | "attending";
  createdAt: number;
  updatedAt: number;
}

export interface Approval {
  _id: Id<"approvals">;
  eventId: Id<"events">;
  rsvpId: Id<"rsvps">;
  clerkUserId: string;
  listKey: string;
  decision: "approved" | "denied";
  decidedBy: string;
  decidedAt: number;
  denialReason?: string;
}

export interface Redemption {
  _id: Id<"redemptions">;
  eventId: Id<"events">;
  clerkUserId: string;
  listKey: string;
  code: string;
  createdAt: number;
  disabledAt?: number;
  redeemedAt?: number;
  redeemedByClerkUserId?: string;
  unredeemHistory: Array<{
    at: number;
    byClerkUserId: string;
    reason?: string;
  }>;
}

// React Hook Form types
export interface UseFormReturn<T = any> {
  control: any;
  handleSubmit: (onSubmit: (data: T) => void | Promise<void>) => (e?: React.BaseSyntheticEvent) => Promise<void>;
  getValues: (name?: keyof T | (keyof T)[]) => any;
  setValue: (name: keyof T, value: any, options?: any) => void;
  setError: (name: keyof T, error: { type: string; message: string }) => void;
  formState: {
    isSubmitting: boolean;
    errors: Record<string, any>;
  };
}

// Component prop interfaces
export interface EventCardProps {
  event: Event;
  fileUrl?: string | null;
}

export interface GuestInfoFieldsProps {
  form: UseFormReturn<RSVPFormData>;
  event: Event;
  name: string;
  setName: (value: string) => void;
  custom: Record<string, string>;
  setCustom: (updater: (current: Record<string, string>) => Record<string, string>) => void;
  phone: string;
  openUserProfile?: () => void;
}

export interface EditEventDialogProps {
  ev: Event;
}

export interface EventCardClientProps {
  ev: Event;
  fileUrl?: string | null;
}

// List credential interface for edit dialog
export interface ListCredentialEdit {
  id?: string;
  listKey: string;
  password: string;
}

// Credential from API response
export interface CredentialResponse {
  _id: string;
  listKey: string;
  // password is never returned from API
}

export interface DateTimePickerProps {
  date?: string;
  time?: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  className?: string;
  buttonClassName?: string;
}

// Form interfaces
export interface EventFormData {
  name: string;
  hosts: string;
  location: string;
  flyerStorageId?: string | null;
  eventDate?: string;
  eventTime?: string;
  maxAttendees?: number;
  lists?: ListCredentialInput[];
  customFieldsJson?: string;
}

// Enhanced event form data for edit dialog
export interface EditEventFormData {
  name: string;
  hosts: string;
  location: string;
  flyerStorageId?: string | null;
  eventDate?: string;
  eventTime?: string;
  maxAttendees?: number;
}

export interface RSVPFormData {
  name: string;
  custom: Record<string, string>;
  attendees?: number;
}

export interface ListCredentialInput {
  id?: string;
  listKey: string;
  password: string;
  generateQR?: boolean;
}

// API response types
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface RSVPStatusResponse {
  status?: "pending" | "approved" | "denied" | "attending";
  listKey?: string;
}

export interface CredentialResolutionResponse {
  ok: boolean;
  listKey?: string;
}

// Custom field definition for builders
export interface CustomFieldDef {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}

// Error types
export interface ApplicationError extends Error {
  code?: string;
  details?: Record<string, unknown>;
}

// Authentication types for rbac
export interface AuthObject {
  userId?: string;
  orgRole?: string;
  has?: (arg: { role: string }) => boolean;
}

// User metadata from Clerk and Convex
export interface UserMetadata {
  name?: string;
  metadata?: Record<string, string>;
}

export interface ClerkUser {
  id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  primaryPhoneNumber?: {
    phoneNumber: string;
  };
  phoneNumbers?: Array<{
    phoneNumber: string;
  }>;
}

// Redemption status response
export interface RedemptionStatusResponse {
  status: "valid" | "redeemed" | "expired" | "invalid";
  name?: string;
  listKey?: string;
  eventId?: string;
}

// Organization interface for Clerk
export interface ClerkOrganization {
  createMembershipRequest?: (options: { role: string }) => Promise<unknown>;
  membershipRequests?: {
    create?: () => Promise<unknown>;
  };
}

// Utility types
export type EventStatus = Event["status"];
export type RSVPStatus = RSVP["status"];
export type ApprovalDecision = Approval["decision"];