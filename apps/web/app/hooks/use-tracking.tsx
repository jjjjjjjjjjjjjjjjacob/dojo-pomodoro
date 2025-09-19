"use client";

import { usePostHog } from "../posthog-provider";

export interface TrackingEventProperties {
  eventId?: string;
  eventName?: string;
  listKey?: string;
  status?: string;
  error?: string;
  [key: string]: any;
}

export function useTracking() {
  const { posthog } = usePostHog();

  const trackEvent = (eventName: string, properties?: TrackingEventProperties) => {
    if (!posthog) return;
    posthog.capture(eventName, properties);
  };

  const trackPageView = (page: string, properties?: TrackingEventProperties) => {
    if (!posthog) return;
    posthog.capture("$pageview", { page, ...properties });
  };

  const trackRSVPSubmission = (properties: TrackingEventProperties) => {
    trackEvent("RSVP Submitted", properties);
  };

  const trackRSVPApproval = (properties: TrackingEventProperties) => {
    trackEvent("RSVP Approved", properties);
  };

  const trackTicketGenerated = (properties: TrackingEventProperties) => {
    trackEvent("Ticket Generated", properties);
  };

  const trackEventCreated = (properties: TrackingEventProperties) => {
    trackEvent("Event Created", properties);
  };

  const trackUserSignIn = () => {
    trackEvent("User Signed In");
  };

  const trackUserSignOut = () => {
    trackEvent("User Signed Out");
  };

  const trackError = (errorType: string, properties?: TrackingEventProperties) => {
    trackEvent("Error Occurred", { errorType, ...properties });
  };

  return {
    trackEvent,
    trackPageView,
    trackRSVPSubmission,
    trackRSVPApproval,
    trackTicketGenerated,
    trackEventCreated,
    trackUserSignIn,
    trackUserSignOut,
    trackError,
  };
}