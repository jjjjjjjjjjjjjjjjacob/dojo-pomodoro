import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { checkRole } from "@/lib/rbac";
import { HostRequestClient } from "./request-client";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export default async function HostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isHost = await checkRole(["admin", "host"]);

  return (
    <>
      <SignedOut>
        <main className="max-w-5xl mx-auto p-6 space-y-6">
          <div className="text-sm">
            Please sign in to access the host dashboard.
          </div>
          <SignInButton>
            <button className="mt-2">Sign in</button>
          </SignInButton>
        </main>
      </SignedOut>
      <SignedIn>
        {isHost ? (
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-center gap-2">
                  <SidebarTrigger className="-ml-1" />
                  <Separator orientation="vertical" className="mr-2 h-4" />
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem className="hidden md:block">
                        <BreadcrumbLink href="/host">
                          Host Dashboard
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb>
                </div>
                <div className="flex flex-1 flex-col gap-4 mt-4">
                  {children}
                </div>
              </div>
            </SidebarInset>
          </SidebarProvider>
        ) : (
          <main className="max-w-5xl mx-auto p-6 space-y-6">
            <HostRequestClient />
          </main>
        )}
      </SignedIn>
    </>
  );
}

// Intentionally no active state logic to keep layout server-only and SSR-friendly.
