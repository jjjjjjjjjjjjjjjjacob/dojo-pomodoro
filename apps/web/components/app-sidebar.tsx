"use client";

import * as React from "react";
import {
  Calendar,
  Users,
  Settings,
  BarChart3,
  Home,
  Plus,
  User,
  DoorOpen,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";

const navigationItems = [
  {
    title: "Overview",
    url: "/host",
    icon: Home,
    isActive: false,
  },
  {
    title: "Events",
    url: "/host/events",
    icon: Calendar,
    isActive: false,
  },
  {
    title: "RSVPs",
    url: "/host/rsvps",
    icon: Users,
    isActive: false,
  },
  {
    title: "Users",
    url: "/host/users",
    icon: User,
    isActive: false,
  },
  {
    title: "Analytics",
    url: "/host/analytics",
    icon: BarChart3,
    isActive: false,
  },
  {
    title: "Door Portal",
    url: "/door",
    icon: DoorOpen,
    isActive: false,
  },
];

const quickActions = [
  {
    title: "New Event",
    url: "/host/new",
    icon: Plus,
    isActive: false,
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { user } = useUser();

  // Update active states based on current path
  const updatedNavItems = navigationItems.map((item) => ({
    ...item,
    isActive: pathname === item.url,
  }));

  const updatedQuickActions = quickActions.map((item) => ({
    ...item,
    isActive: pathname === item.url,
  }));

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 py-2 text-sidebar-foreground w-full">
          <div className="flex flex-shrink-0 size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <span className="font-noto-emoji font-extrabold scale-x-90">
              🍅
            </span>
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">Dojo Pomodoro</span>
            <span className="truncate text-xs">Host Dashboard</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {updatedNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={item.isActive}>
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Quick Actions</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {updatedQuickActions.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={item.isActive}>
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <div className="flex items-center gap-2 cursor-pointer">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <User className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {user?.firstName || "Host"}
                  </span>
                  <span className="truncate text-xs">
                    {user?.emailAddresses?.[0]?.emailAddress ||
                      "host@example.com"}
                  </span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

