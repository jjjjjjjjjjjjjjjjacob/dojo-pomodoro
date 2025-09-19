"use client";
import React from "react";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexReactClient } from "convex/react";
import { Toaster } from "@/components/ui/sonner";
import { PostHogProvider } from "./posthog-provider";
import { HapticProvider } from "@/contexts/haptic-context";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!;
const convex = new ConvexReactClient(convexUrl);
const convexQueryClient = new ConvexQueryClient(convex);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn: convexQueryClient.hashFn(),
      queryFn: convexQueryClient.queryFn(),
    },
  },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <PostHogProvider>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <QueryClientProvider client={queryClient}>
            <HapticProvider>
              {children}
              <Toaster position="top-center" />
            </HapticProvider>
          </QueryClientProvider>
        </ConvexProviderWithClerk>
      </PostHogProvider>
    </ClerkProvider>
  );
}
