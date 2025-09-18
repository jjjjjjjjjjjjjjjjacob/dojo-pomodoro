/**
 * URL manipulation utilities
 */

/**
 * Adds or updates URL search parameters
 */
export function updateURLParams(
  url: string,
  params: Record<string, string | number | boolean | null | undefined>
): string {
  const urlObj = new URL(url, window.location.origin);

  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      urlObj.searchParams.delete(key);
    } else {
      urlObj.searchParams.set(key, String(value));
    }
  });

  return urlObj.toString();
}

/**
 * Removes specified parameters from URL
 */
export function removeURLParams(url: string, paramNames: string[]): string {
  const urlObj = new URL(url, window.location.origin);

  paramNames.forEach(param => {
    urlObj.searchParams.delete(param);
  });

  return urlObj.pathname + urlObj.search;
}

/**
 * Gets current URL without specified parameters
 */
export function getCurrentURLWithoutParams(paramNames: string[]): string {
  return removeURLParams(window.location.href, paramNames);
}

/**
 * Builds event URL
 */
export function buildEventURL(
  eventId: string,
  path: string = "",
  params: Record<string, string> = {}
): string {
  const baseUrl = `${window.location.origin}/events/${eventId}`;
  const fullPath = path ? `${baseUrl}/${path.replace(/^\//, "")}` : baseUrl;

  if (Object.keys(params).length === 0) {
    return fullPath;
  }

  const url = new URL(fullPath);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
}

/**
 * Builds host URL
 */
export function buildHostURL(path: string = "", params: Record<string, string> = {}): string {
  const baseUrl = `${window.location.origin}/host`;
  const fullPath = path ? `${baseUrl}/${path.replace(/^\//, "")}` : baseUrl;

  if (Object.keys(params).length === 0) {
    return fullPath;
  }

  const url = new URL(fullPath);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
}

/**
 * Builds RSVP URL for an event
 */
export function buildRSVPURL(eventId: string, params: Record<string, string> = {}): string {
  return buildEventURL(eventId, "rsvp", params);
}

/**
 * Builds ticket URL for an event
 */
export function buildTicketURL(
  eventId: string,
  guestId?: string,
  params: Record<string, string> = {}
): string {
  const allParams = guestId ? { guest: guestId, ...params } : params;
  return buildEventURL(eventId, "ticket", allParams);
}

/**
 * Builds door redemption URL
 */
export function buildRedemptionURL(code: string): string {
  return `${window.location.origin}/redeem/${code}`;
}

/**
 * Extracts event ID from current URL
 */
export function extractEventIdFromURL(url: string = window.location.pathname): string | null {
  const match = url.match(/\/events\/([^\/\?]+)/);
  return match ? match[1] : null;
}

/**
 * Extracts guest ID from URL parameters
 */
export function extractGuestIdFromURL(url: string = window.location.href): string | null {
  const urlObj = new URL(url, window.location.origin);
  return urlObj.searchParams.get("guest");
}

/**
 * Extracts redemption code from URL
 */
export function extractRedemptionCodeFromURL(url: string = window.location.pathname): string | null {
  const match = url.match(/\/redeem\/([^\/\?]+)/);
  return match ? match[1] : null;
}

/**
 * Checks if current page is an event page
 */
export function isEventPage(url: string = window.location.pathname): boolean {
  return /\/events\/[^\/]+/.test(url);
}

/**
 * Checks if current page is a host page
 */
export function isHostPage(url: string = window.location.pathname): boolean {
  return url.startsWith("/host");
}

/**
 * Checks if current page is a door access page
 */
export function isDoorPage(url: string = window.location.pathname): boolean {
  return url.startsWith("/door");
}

/**
 * Creates a shareable URL with tracking parameters
 */
export function createShareableURL(
  baseUrl: string,
  source: string = "share",
  medium: string = "link"
): string {
  return updateURLParams(baseUrl, {
    utm_source: source,
    utm_medium: medium,
    utm_campaign: "event_share",
  });
}