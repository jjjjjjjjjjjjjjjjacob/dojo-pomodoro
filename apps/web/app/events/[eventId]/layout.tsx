import React from "react";

export default function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  // All routing logic is now handled in middleware.ts
  // This layout just passes through the children
  return <>{children}</>;
}