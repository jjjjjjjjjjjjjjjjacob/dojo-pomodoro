"use client";

import React from "react";
import { SignIn } from "@clerk/nextjs";

interface SignInClientProps {
  redirectUrl: string;
}

export function SignInClient({ redirectUrl }: SignInClientProps) {
  return (
    <main className="min-h-[60vh] grid place-items-center p-6">
      <SignIn
        routing="hash"
        withSignUp
        forceRedirectUrl={redirectUrl}
        signUpForceRedirectUrl={redirectUrl}
      />
    </main>
  );
}
