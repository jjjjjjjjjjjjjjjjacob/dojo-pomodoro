"use client";

import React, { createContext, useContext, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import posthog, { PostHog } from "posthog-js";

type PostHogContextType = {
  posthog: PostHog | null;
};

const PostHogContext = createContext<PostHogContextType>({ posthog: null });

export function usePostHog() {
  const context = useContext(PostHogContext);
  if (context === undefined) {
    throw new Error("usePostHog must be used within a PostHogProvider");
  }
  return context;
}

interface PostHogProviderProps {
  children: React.ReactNode;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  const { user, isLoaded } = useUser();

  useEffect(() => {
    const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

    if (!posthogKey) {
      console.warn("PostHog key not found. Analytics will be disabled.");
      return;
    }

    if (typeof window !== "undefined") {
      posthog.init(posthogKey, {
        api_host: posthogHost || "https://app.posthog.com",
        person_profiles: "identified_only",
        loaded: (posthog) => {
          if (process.env.NODE_ENV === "development") {
            console.warn("PostHog loaded in development mode");
          }
        },
      });
    }
  }, []);

  useEffect(() => {
    if (isLoaded && user && typeof window !== "undefined") {
      posthog.identify(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        imageUrl: user.imageUrl,
      });
    } else if (isLoaded && !user && typeof window !== "undefined") {
      posthog.reset();
    }
  }, [user, isLoaded]);

  return (
    <PostHogContext.Provider value={{ posthog }}>
      {children}
    </PostHogContext.Provider>
  );
}

