"use client";
import { SignIn } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

export default function Page() {
  const sp = useSearchParams();
  const redirect = sp?.get("redirect_url") || "/";

  return (
    <main className="min-h-[60vh] grid place-items-center p-6">
      <SignIn
        routing="hash"
        withSignUp
        forceRedirectUrl={redirect}
        signUpForceRedirectUrl={redirect}
      />
    </main>
  );
}
