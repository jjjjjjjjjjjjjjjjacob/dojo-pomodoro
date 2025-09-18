"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import { OrganizationSwitcher, useOrganization } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function HostRequestClient() {
  const router = useRouter();
  const { organization } = useOrganization();
  return (
    <section className="space-y-3">
      <div className="rounded border p-4 space-y-2">
        <div className="font-medium">Host access required</div>
        <div className="text-sm text-foreground/70">
          Select your organization and request host access, or go back home.
        </div>
        <OrganizationSwitcher
          appearance={{ elements: { createOrganization: "hidden", createOrganizationButton: "hidden" } }}
          hidePersonal
        />
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              if (!organization) return;
              try {
                await (organization as any).createMembershipRequest?.({ role: "host" })
                  ?? (organization as any).membershipRequests?.create?.();
                toast.success("Requested host access");
              } catch (e: any) {
                toast.error(e?.errors?.[0]?.message || e?.message || "Request failed");
              }
            }}
          >
            Request Host Access
          </Button>
          <Button variant="outline" onClick={() => router.replace("/")}>Go Home</Button>
        </div>
      </div>
    </section>
  );
}

