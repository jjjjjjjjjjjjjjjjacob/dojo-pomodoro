"use client";
import React, { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectOption } from "@/components/ui/select";
import { FlyerUpload } from "@/components/flyer-upload";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import {
  CustomFieldsEditor,
  type CustomFieldDef,
} from "@/components/custom-fields-builder";
import { DateTimePicker } from "@/components/date-time-picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useForm } from "react-hook-form";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Event,
  EditEventFormData,
  ListCredentialEdit,
  CredentialResponse,
  ApplicationError,
} from "@/lib/types";

export default function EditEventDialog({ event }: { event: Event }) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<EditEventFormData>({
    defaultValues: {
      name: event.name || "",
      hosts: (event.hosts || []).join(", "),
      location: event.location || "",
      flyerStorageId: event.flyerStorageId ?? null,
      maxAttendees: event.maxAttendees ?? 1,
    },
  });
  const [flyerStorageId, setFlyerStorageId] = React.useState<string | null>(
    event.flyerStorageId ?? null,
  );
  const [eventDateOnly, setEventDateOnly] = React.useState(() => {
    try {
      const date = new Date(event.eventDate);
      // Use UTC methods to extract the exact date that was stored
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    } catch {
      return "";
    }
  });
  const [eventTimeOnly, setEventTimeOnly] = React.useState(() => {
    try {
      const date = new Date(event.eventDate);
      // Use UTC methods to extract the exact time that was stored
      const hours = String(date.getUTCHours()).padStart(2, "0");
      const minutes = String(date.getUTCMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    } catch {
      return "";
    }
  });
  const [saving, setSaving] = React.useState(false);
  const update = useAction(api.eventsNode.update);
  const creds = useQuery(
    api.credentials.getCredsForEvent,
    open ? { eventId: event._id } : "skip",
  ) as CredentialResponse[] | undefined;
  const [lists, setLists] = React.useState<ListCredentialEdit[]>([]);
  const [customFields, setCustomFields] = React.useState<CustomFieldDef[]>(
    event.customFields ?? [],
  );

  useEffect(() => {
    if (open && creds) {
      setLists(
        creds.map((c) => ({
          id: c._id,
          listKey: c.listKey,
          password: "",
        })),
      );
    }
  }, [open, creds]);

  const addList = () =>
    setLists((array) => [...array, { listKey: "", password: "" }]);
  const setList = (index: number, key: "listKey" | "password", value: string) =>
    setLists((array) =>
      array.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    );
  const removeList = (index: number) =>
    setLists((array) => array.filter((_, i) => i !== index));

  async function onSave() {
    try {
      setSaving(true);
      const patch: Partial<Event> = {};
      const values = form.getValues();
      if (values.name && values.name !== event.name) patch.name = values.name;
      const hostArray = values.hosts
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (JSON.stringify(hostArray) !== JSON.stringify(event.hosts))
        patch.hosts = hostArray;
      if (values.location && values.location !== event.location)
        patch.location = values.location;
      if ((flyerStorageId ?? undefined) !== (event.flyerStorageId ?? undefined))
        patch.flyerStorageId = (flyerStorageId as Id<"_storage">) ?? undefined;
      if (values.maxAttendees !== undefined && values.maxAttendees !== (event.maxAttendees ?? 1))
        patch.maxAttendees = values.maxAttendees;
      // Compute local timestamp to avoid timezone skew; prefer RHF values
      const dateStr = form.getValues("eventDate") || eventDateOnly;
      const timeStr = form.getValues("eventTime") || eventTimeOnly;
      if (dateStr) {
        const [year, month, day] = dateStr
          .split("-")
          .map((value) => parseInt(value, 10));
        let dateTime: number | undefined;
        if (
          Number.isFinite(year) &&
          Number.isFinite(month) &&
          Number.isFinite(day)
        ) {
          if (timeStr) {
            const [hours, minutes] = timeStr
              .split(":")
              .map((value) => parseInt(value, 10));
            dateTime = new Date(Date.UTC(
              year,
              (month as number) - 1,
              day,
              hours || 0,
              minutes || 0,
            )).getTime();
          } else {
            dateTime = new Date(Date.UTC(year, (month as number) - 1, day)).getTime();
          }
        }
        if (dateTime && !Number.isNaN(dateTime) && dateTime !== event.eventDate)
          patch.eventDate = dateTime;
      }
      const outgoingLists = lists.map((l) => ({
        id: l.id as Id<"listCredentials"> | undefined,
        listKey: l.listKey,
        password: l.password || undefined,
      }));
      patch.customFields = customFields;
      await update({ eventId: event._id, patch, lists: outgoingLists });
      toast.success("Event updated");
      setOpen(false);
    } catch (error: unknown) {
      const errorDetails = error as ApplicationError | Error;
      toast.error(errorDetails?.message || "Failed to update event");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="text-sm px-2 py-1 border rounded">Edit</button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Event</DialogTitle>
          <DialogDescription>
            Update details and flyer. Password lists are managed on creation.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              onSave();
            }}
          >
            <FormField
              control={form.control}
              name="name"
              rules={{ required: "Name is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Event name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="hosts"
              rules={{ required: "Hosts are required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hosts (comma-separated emails)</FormLabel>
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
            <FormField
              control={form.control}
              name="location"
              rules={{ required: "Location is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input placeholder="Venue" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="maxAttendees"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Maximum Attendees</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value?.toString() || "1"}
                      onValueChange={(value) => field.onChange(parseInt(value, 10))}
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
            <FormItem>
              <FormLabel>Flyer</FormLabel>
              <FormControl>
                <FlyerUpload
                  value={flyerStorageId}
                  onChange={setFlyerStorageId}
                />
              </FormControl>
            </FormItem>
            <FormField
              control={form.control}
              name="eventDate"
              rules={{ required: "Date is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date & Time</FormLabel>
                  <FormControl>
                    <DateTimePicker
                      date={(field.value as string) || eventDateOnly}
                      time={form.getValues("eventTime") || eventTimeOnly}
                      onDateChange={(val) => {
                        setEventDateOnly(val);
                        field.onChange(val);
                      }}
                      onTimeChange={(val) => {
                        setEventTimeOnly(val);
                        form.setValue("eventTime", val, { shouldDirty: true });
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="rounded border p-3 space-y-2">
              <div className="font-medium text-sm">Lists & Passwords</div>
              {lists.map((listPassword, index) => (
                <div
                  key={listPassword.id ?? index}
                  className="grid grid-cols-3 gap-2 items-center"
                >
                  <Input
                    placeholder="List key (e.g. vip)"
                    value={listPassword.listKey}
                    onChange={(e) => setList(index, "listKey", e.target.value.trim())}
                  />
                  <Input
                    placeholder="New password (leave blank to keep)"
                    value={listPassword.password}
                    onChange={(e) => setList(index, "password", e.target.value.trim())}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => removeList(index)}
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
              >
                Add another
              </Button>
            </div>
            <CustomFieldsEditor
              initial={event.customFields ?? []}
              onChange={setCustomFields}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
