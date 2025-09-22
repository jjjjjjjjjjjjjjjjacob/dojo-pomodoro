"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { useForm } from "react-hook-form";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectOption } from "@/components/ui/select";
import { FlyerUpload } from "@/components/flyer-upload";
import { CustomFieldsBuilderForm } from "@/components/custom-fields-builder";
import { toast } from "sonner";

type ListRow = { listKey: string; password: string };
type CustomField = {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
};

function validateCreate(v: any): string[] {
  const errs: string[] = [];
  if (!v.name?.trim()) errs.push("Name is required");
  if (!v.hosts?.trim()) errs.push("Hosts are required");
  if (!v.location?.trim()) errs.push("Location is required");
  if (!v.eventDate) errs.push("Event date is required");
  const lists: ListRow[] = v.lists || [];
  const filtered = lists.filter((l) => l.listKey?.trim() && l.password?.trim());
  if (filtered.length === 0) errs.push("Add at least one list/password");
  return errs;
}

export default function NewEventClient() {
  const router = useRouter();
  const create = useAction(api.eventsNode.create);
  const form = useForm<{
    name: string;
    hosts: string;
    location: string;
    eventDate: string;
    eventTime?: string;
    flyerStorageId?: string | null;
    maxAttendees: number;
    lists: ListRow[];
    customFieldsJson: string;
  }>({
    defaultValues: {
      name: "",
      hosts: "",
      location: "",
      eventDate: "",
      eventTime: "19:00",
      flyerStorageId: null,
      maxAttendees: 1,
      lists: [
        { listKey: "vip", password: "" },
        { listKey: "ga", password: "" },
      ],
      customFieldsJson: "[]",
    },
  });

  const lists = form.watch("lists");

  const addList = () =>
    form.setValue("lists", [
      ...(form.getValues("lists") || []),
      { listKey: "", password: "" },
    ]);
  const setList = (i: number, key: keyof ListRow, val: string) => {
    const copy = [...(form.getValues("lists") || [])];
    copy[i][key] = val;
    form.setValue("lists", copy);
  };
  const removeList = (i: number) => {
    const copy = [...(form.getValues("lists") || [])];
    copy.splice(i, 1);
    form.setValue("lists", copy);
  };

  const onSubmit = async (values: any) => {
    const errs = validateCreate(values);
    if (errs.length) {
      errs.forEach((e) => toast.error(e));
      return;
    }
    try {
      const hostArr = values.hosts
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      const [y, m, d] = (values.eventDate || "").split("-");
      const [hh, mm] = (values.eventTime || "00:00").split(":");
      // Create date in UTC to avoid timezone issues during storage/display
      const dt = new Date(
        Date.UTC(
          Number(y),
          Number(m) - 1,
          Number(d),
          Number(hh) || 0,
          Number(mm) || 0,
        ),
      ).getTime();
      const listsFiltered = (values.lists as ListRow[]).filter(
        (l) => l.listKey?.trim() && l.password?.trim(),
      );
      const customFields: CustomField[] = JSON.parse(
        values.customFieldsJson || "[]",
      );
      await create({
        name: values.name.trim(),
        hosts: hostArr,
        location: values.location.trim(),
        flyerStorageId: values.flyerStorageId || undefined,
        eventDate: dt,
        maxAttendees: values.maxAttendees,
        lists: listsFiltered,
        customFields,
      });
      toast.success("Event created");
      router.replace("/host/events?created=1");
    } catch (e: any) {
      toast.error(e?.message || "Failed to create event");
    }
  };

  return (
    <section className="space-y-6 max-w-2xl">
      <h2 className="text-lg font-medium">Create Event</h2>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Event Basic Info */}
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">
              EVENT DETAILS
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                rules={{ required: "Name is required" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter event name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="location"
                rules={{ required: "Location is required" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter venue or location" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="hosts"
              rules={{ required: "Hosts are required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Host Emails (comma-separated)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="host1@example.com, host2@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Date, Time & Capacity */}
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">
              DATE & CAPACITY
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="eventDate"
                rules={{ required: "Event date is required" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="eventTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time</FormLabel>
                    <FormControl>
                      <Input type="time" step={60} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxAttendees"
                render={({ field }) => (
                  <FormItem className="w-36 sm:ml-auto">
                    <FormLabel>Max Attendees</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value?.toString() || "1"}
                        onValueChange={(value) =>
                          field.onChange(parseInt(value, 10))
                        }
                      >
                        <SelectOption value="1">1 (No plus-ones)</SelectOption>
                        <SelectOption value="2">2</SelectOption>
                        <SelectOption value="3">3</SelectOption>
                        <SelectOption value="4">4</SelectOption>
                        <SelectOption value="5">5</SelectOption>
                        <SelectOption value="6">6</SelectOption>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Flyer */}
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">
              EVENT FLYER
            </h3>
            <FormField
              control={form.control}
              name="flyerStorageId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Upload Flyer (Optional)</FormLabel>
                  <FormControl>
                    <FlyerUpload
                      value={field.value || null}
                      onChange={(v) => field.onChange(v)}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          {/* Access Lists & Passwords */}
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">
              ACCESS LISTS & PASSWORDS
            </h3>
            <div className="space-y-3">
              {(lists || []).map((lp, idx) => (
                <div
                  key={idx}
                  className="flex gap-3 items-end p-3 rounded-lg border bg-background"
                >
                  <div className="flex flex-col w-full">
                    <label className="text-xs font-medium text-muted-foreground">
                      List Name
                    </label>
                    <Input
                      placeholder="e.g. vip, general, backstage"
                      value={lp.listKey}
                      onChange={(e) => setList(idx, "listKey", e.target.value)}
                    />
                  </div>
                  <div className="flex w-full flex-col">
                    <label className="text-xs font-medium text-muted-foreground">
                      Password
                    </label>
                    <Input
                      placeholder="Enter secure password"
                      value={lp.password}
                      onChange={(e) => setList(idx, "password", e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => removeList(idx)}
                    className="h-10"
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addList}
                className="w-full"
              >
                + Add Another List
              </Button>
            </div>
          </div>

          <CustomFieldsBuilderForm />

          {/* Submit */}
          <div className="flex justify-end pt-4 border-t">
            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              size="lg"
            >
              {form.formState.isSubmitting
                ? "Creating Event..."
                : "Create Event"}
            </Button>
          </div>
        </form>
      </Form>
    </section>
  );
}
