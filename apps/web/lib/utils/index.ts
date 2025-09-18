/**
 * Centralized exports for all utility functions
 *
 * This file provides a single import point for all utility functions,
 * making it easier to use utilities across the application.
 */

// Re-export existing utilities (avoiding conflicts)
export { cn, copyEventLink, type ClassValue } from "../utils";
export {
  formatEventDate,
  formatEventTime,
  formatEventDateTime,
  formatRelativeTime,
  formatDateForInput,
  formatTimeForInput,
  createTimestamp,
} from "../date-utils";
export {
  showSuccessToast,
  showErrorToast,
  getErrorMessage,
  handleAsyncOperation,
  validateRequiredFields,
  handleFormSubmission,
  AppError,
} from "../error-utils";
export * from "../mini-zod";

// Re-export new utilities
export * from "./clipboard";
export * from "./qr-code";
export * from "./url";
export * from "./toast-messages";

// Import functions for utility groups (avoid re-importing already exported functions)
import { copyEventLink } from "../utils";
import {
  formatEventDate,
  formatEventTime,
  formatEventDateTime,
  formatRelativeTime,
  formatDateForInput,
  formatTimeForInput,
  createTimestamp,
} from "../date-utils";

import {
  showSuccessToast,
  showErrorToast,
  getErrorMessage,
  handleAsyncOperation,
  validateRequiredFields,
  handleFormSubmission,
  AppError,
} from "../error-utils";

import {
  copyToClipboard,
  copyQRCodeData,
  copyGuestInfo,
} from "./clipboard";

import {
  generateQRCodeDataURL,
  downloadQRCode,
  generateEventTicketQR,
  generateDoorAccessQR,
  parseQRCodeData,
} from "./qr-code";

import {
  updateURLParams,
  removeURLParams,
  getCurrentURLWithoutParams,
  buildEventURL,
  buildHostURL,
  buildRSVPURL,
  buildTicketURL,
  buildRedemptionURL,
  extractEventIdFromURL,
  extractGuestIdFromURL,
  extractRedemptionCodeFromURL,
  isEventPage,
  isHostPage,
  isDoorPage,
  createShareableURL,
} from "./url";

import {
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
  toastHelpers,
  getSuccessMessage,
} from "./toast-messages";

// Utility function groups for easier organization
export const dateUtils = {
  formatEventDate,
  formatEventTime,
  formatEventDateTime,
  formatRelativeTime,
  formatDateForInput,
  formatTimeForInput,
  createTimestamp,
};

export const errorUtils = {
  showSuccessToast,
  showErrorToast,
  getErrorMessage,
  handleAsyncOperation,
  validateRequiredFields,
  handleFormSubmission,
  AppError,
};

export const clipboardUtils = {
  copyToClipboard,
  copyEventLink,
  copyQRCodeData,
  copyGuestInfo,
};

export const qrUtils = {
  generateQRCodeDataURL,
  downloadQRCode,
  generateEventTicketQR,
  generateDoorAccessQR,
  parseQRCodeData,
};

export const urlUtils = {
  updateURLParams,
  removeURLParams,
  getCurrentURLWithoutParams,
  buildEventURL,
  buildHostURL,
  buildRSVPURL,
  buildTicketURL,
  buildRedemptionURL,
  extractEventIdFromURL,
  extractGuestIdFromURL,
  extractRedemptionCodeFromURL,
  isEventPage,
  isHostPage,
  isDoorPage,
  createShareableURL,
};

export const toastUtils = {
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
  toastHelpers,
  getSuccessMessage,
};