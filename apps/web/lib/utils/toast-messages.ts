/**
 * Standardized toast message constants and helpers
 */

import { showSuccessToast, showErrorToast } from "../error-utils";

/**
 * Standard success messages
 */
export const SUCCESS_MESSAGES = {
  // Event management
  EVENT_CREATED: "Event created",
  EVENT_UPDATED: "Event updated",
  EVENT_DELETED: "Event deleted",

  // RSVP management
  RSVP_SUBMITTED: "Request submitted",
  RSVP_APPROVED: "Approved",
  RSVP_DENIED: "Denied",

  // Access management
  DOOR_ACCESS_REQUESTED: "Requested door access",
  HOST_ACCESS_REQUESTED: "Requested host access",

  // Redemption
  CODE_REDEEMED: "Redeemed",
  CODE_UNREDEEMED: "Un-redeemed",

  // Clipboard operations
  LINK_COPIED: "Link copied",
  EVENT_LINK_COPIED: "Event link copied",
  GUEST_INFO_COPIED: "Guest information copied",
  QR_CODE_COPIED: "QR code data copied",

  // File operations
  QR_CODE_DOWNLOADED: "QR code downloaded successfully",

  // Confirmations
  CONFIRMED_FOR_EVENT: "You're confirmed for the event 🎉",
} as const;

/**
 * Standard error messages
 */
export const ERROR_MESSAGES = {
  // Generic errors
  OPERATION_FAILED: "Operation failed",
  UNEXPECTED_ERROR: "An unexpected error occurred",

  // Form validation
  MISSING_REQUIRED_FIELDS: "Missing required fields",
  INVALID_INPUT: "Invalid input provided",

  // Event management
  EVENT_CREATION_FAILED: "Failed to create event",
  EVENT_UPDATE_FAILED: "Failed to update event",
  EVENT_DELETION_FAILED: "Failed to delete event",
  EVENT_LOAD_FAILED: "Failed to load event",

  // RSVP management
  RSVP_SUBMISSION_FAILED: "Request failed",
  RSVP_APPROVAL_FAILED: "Failed to approve request",
  RSVP_DENIAL_FAILED: "Failed to deny request",

  // Access management
  ACCESS_REQUEST_FAILED: "Request failed",
  PERMISSION_DENIED: "Permission denied",

  // Clipboard operations
  COPY_FAILED: "Failed to copy to clipboard",
  COPY_LINK_FAILED: "Failed to copy link",

  // QR code operations
  QR_CODE_GENERATION_FAILED: "Failed to generate QR code",
  QR_CODE_DOWNLOAD_FAILED: "Failed to download QR code",
  QR_CODE_LOAD_FAILED: "Failed to load QR code",
  QR_CODE_NOT_FOUND: "No QR code found for this guest",

  // Redemption
  REDEMPTION_TOGGLE_FAILED: "Failed to toggle redemption status",

  // File operations
  DOWNLOAD_FAILED: "Failed to create download file",
} as const;

/**
 * Toast message helpers for common operations
 */
export const toastHelpers = {
  /**
   * Shows success toast for event creation
   */
  eventCreated: () => showSuccessToast(SUCCESS_MESSAGES.EVENT_CREATED),

  /**
   * Shows success toast for event update
   */
  eventUpdated: () => showSuccessToast(SUCCESS_MESSAGES.EVENT_UPDATED),

  /**
   * Shows success toast for RSVP submission
   */
  rsvpSubmitted: () => showSuccessToast(SUCCESS_MESSAGES.RSVP_SUBMITTED),

  /**
   * Shows success toast for RSVP approval
   */
  rsvpApproved: () => showSuccessToast(SUCCESS_MESSAGES.RSVP_APPROVED),

  /**
   * Shows success toast for RSVP denial
   */
  rsvpDenied: () => showSuccessToast(SUCCESS_MESSAGES.RSVP_DENIED),

  /**
   * Shows success toast for door access request
   */
  doorAccessRequested: () => showSuccessToast(SUCCESS_MESSAGES.DOOR_ACCESS_REQUESTED),

  /**
   * Shows success toast for host access request
   */
  hostAccessRequested: () => showSuccessToast(SUCCESS_MESSAGES.HOST_ACCESS_REQUESTED),

  /**
   * Shows success toast for code redemption
   */
  codeRedeemed: () => showSuccessToast(SUCCESS_MESSAGES.CODE_REDEEMED),

  /**
   * Shows success toast for code unredemption
   */
  codeUnredeemed: () => showSuccessToast(SUCCESS_MESSAGES.CODE_UNREDEEMED),

  /**
   * Shows success toast for link copying
   */
  linkCopied: () => showSuccessToast(SUCCESS_MESSAGES.LINK_COPIED),

  /**
   * Shows success toast for event link copying
   */
  eventLinkCopied: () => showSuccessToast(SUCCESS_MESSAGES.EVENT_LINK_COPIED),

  /**
   * Shows success toast for QR code download
   */
  qrCodeDownloaded: () => showSuccessToast(SUCCESS_MESSAGES.QR_CODE_DOWNLOADED),

  /**
   * Shows success toast for event confirmation
   */
  confirmedForEvent: (eventName: string) =>
    showSuccessToast(`You're confirmed for ${eventName} 🎉`),

  /**
   * Shows error toast for missing required fields
   */
  missingRequiredFields: (message?: string) =>
    showErrorToast(ERROR_MESSAGES.MISSING_REQUIRED_FIELDS, message),

  /**
   * Shows error toast for RSVP submission failure
   */
  rsvpSubmissionFailed: (message?: string) =>
    showErrorToast(ERROR_MESSAGES.RSVP_SUBMISSION_FAILED, message),

  /**
   * Shows error toast for event creation failure
   */
  eventCreationFailed: (error: unknown) =>
    showErrorToast(error, ERROR_MESSAGES.EVENT_CREATION_FAILED),

  /**
   * Shows error toast for event update failure
   */
  eventUpdateFailed: (error: unknown) =>
    showErrorToast(error, ERROR_MESSAGES.EVENT_UPDATE_FAILED),

  /**
   * Shows error toast for access request failure
   */
  accessRequestFailed: (error: unknown) =>
    showErrorToast(error, ERROR_MESSAGES.ACCESS_REQUEST_FAILED),

  /**
   * Shows error toast for QR code generation failure
   */
  qrCodeGenerationFailed: () =>
    showErrorToast(ERROR_MESSAGES.QR_CODE_GENERATION_FAILED),

  /**
   * Shows error toast for QR code download failure
   */
  qrCodeDownloadFailed: () =>
    showErrorToast(ERROR_MESSAGES.QR_CODE_DOWNLOAD_FAILED),

  /**
   * Shows error toast when no QR code is found
   */
  qrCodeNotFound: () =>
    showErrorToast(ERROR_MESSAGES.QR_CODE_NOT_FOUND),

  /**
   * Shows error toast for redemption toggle failure
   */
  redemptionToggleFailed: () =>
    showErrorToast(ERROR_MESSAGES.REDEMPTION_TOGGLE_FAILED),
} as const;

/**
 * Type-safe message getter
 */
export function getSuccessMessage(key: keyof typeof SUCCESS_MESSAGES): string {
  return SUCCESS_MESSAGES[key];
}

/**
 * Type-safe error message getter
 */
export function getErrorMessage(key: keyof typeof ERROR_MESSAGES): string {
  return ERROR_MESSAGES[key];
}