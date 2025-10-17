"use client";

import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import QRCode from "react-qr-code";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getEventThemeColors,
  getColorContrastRatio,
  getAccessibleTextColor,
  EVENT_THEME_DEFAULT_BACKGROUND_COLOR,
} from "@/lib/event-theme";

export default function TicketPage() {
  const featuredEventQuery = useQuery(
    convexQuery(api.events.getFeaturedEvent, {}),
  );
  const featuredEvent = featuredEventQuery.data;

  if (featuredEventQuery.isLoading) {
    return (
      <div className="flex text-primary items-center justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (!featuredEvent) {
    return (
      <section className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>No Active Event</CardTitle>
            <CardDescription>
              There is no featured event at this time.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const ticketUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/events/${featuredEvent._id}/ticket`;
  const eventDate = new Date(featuredEvent.eventDate);
  const { backgroundColor: eventBackgroundColor, textColor: eventTextColor } =
    getEventThemeColors(featuredEvent);
  const contrastRatio = getColorContrastRatio(
    eventTextColor,
    eventBackgroundColor,
  );
  const hasAdequateContrast = contrastRatio >= 4.5;
  const qrForegroundColor = hasAdequateContrast
    ? eventTextColor
    : getAccessibleTextColor(eventBackgroundColor);
  const qrBackgroundColor = hasAdequateContrast
    ? eventBackgroundColor
    : EVENT_THEME_DEFAULT_BACKGROUND_COLOR;

  return (
    <section className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>{featuredEvent.name}</CardTitle>
          <CardDescription>
            {eventDate.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })} at {featuredEvent.location}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          <div
            className="p-4 rounded-lg"
            style={{ backgroundColor: qrBackgroundColor }}
          >
            <QRCode
              value={ticketUrl}
              size={256}
              fgColor={qrForegroundColor}
              bgColor={qrBackgroundColor}
              style={{ height: "auto", maxWidth: "100%", width: "100%" }}
            />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Scan this QR code to access the ticket page
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
