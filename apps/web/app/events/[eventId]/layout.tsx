import React from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { buildEventThemeStyle } from "@/lib/event-theme";

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  let eventThemeStyle = buildEventThemeStyle(null);

  try {
    const event = await fetchQuery(api.events.get, {
      eventId: eventId as Id<"events">,
    });
    eventThemeStyle = buildEventThemeStyle(event ?? null);
  } catch (error) {
    console.error("Failed to load event theme", error);
  }

  return (
    <div className="min-h-screen" style={eventThemeStyle}>
      {children}
    </div>
  );
}
