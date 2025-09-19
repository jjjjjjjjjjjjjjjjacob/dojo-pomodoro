"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FlyerUpload } from "@/components/flyer-upload";
import { CustomFieldsBuilderForm } from "@/components/custom-fields-builder";
import { toast } from "sonner";

type ListRow = { listKey: string; password: string };
type CustomField = { key: string; label: string; placeholder?: string; required?: boolean };

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
  const form = useForm<{ name: string; hosts: string; location: string; eventDate: string; eventTime?: string; flyerStorageId?: string | null; lists: ListRow[]; customFieldsJson: string }>({
    defaultValues: { name: "", hosts: "", location: "", eventDate: "", eventTime: "19:00", flyerStorageId: null, lists: [{ listKey: "vip", password: "" }, { listKey: "ga", password: "" }], customFieldsJson: "[]" },
  });

  const lists = form.watch("lists");

  const addList = () => form.setValue("lists", [...(form.getValues("lists") || []), { listKey: "", password: "" }]);
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
      const hostArr = values.hosts.split(",").map((s: string) => s.trim()).filter(Boolean);
      const [y, m, d] = (values.eventDate || "").split("-");
      const [hh, mm] = (values.eventTime || "00:00").split(":");
      // Create date in UTC to avoid timezone issues during storage/display
      const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh) || 0, Number(mm) || 0)).getTime();
      const listsFiltered = (values.lists as ListRow[]).filter((l) => l.listKey?.trim() && l.password?.trim());
      const customFields: CustomField[] = JSON.parse(values.customFieldsJson || "[]");
      await create({
        name: values.name.trim(),
        hosts: hostArr,
        location: values.location.trim(),
        flyerStorageId: values.flyerStorageId || undefined,
        eventDate: dt,
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
    <section className="space-y-4 max-w-xl">
      <h2 className="text-lg font-medium">Create Event</h2>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <FormField control={form.control} name="name" rules={{ required: "Name is required" }} render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl><Input placeholder="Event name" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="hosts" rules={{ required: "Hosts are required" }} render={({ field }) => (
            <FormItem>
              <FormLabel>Hosts (comma-separated emails)</FormLabel>
              <FormControl><Input placeholder="host1@example.com, host2@example.com" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="location" rules={{ required: "Location is required" }} render={({ field }) => (
            <FormItem>
              <FormLabel>Location</FormLabel>
              <FormControl><Input placeholder="Venue" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="flyerStorageId" render={({ field }) => (
            <FormItem>
              <FormLabel>Flyer</FormLabel>
              <FormControl><FlyerUpload value={field.value || null} onChange={(v) => field.onChange(v)} /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="eventDate" rules={{ required: "Event date is required" }} render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl><Input type="date" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="eventTime" render={({ field }) => (
            <FormItem>
              <FormLabel>Time</FormLabel>
              <FormControl><Input type="time" step={60} {...field} /></FormControl>
            </FormItem>
          )} />
          <div className="rounded border p-3 space-y-2">
            <div className="font-medium text-sm">Lists & Passwords</div>
            {(lists || []).map((lp, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2 items-center">
                <Input placeholder="List (e.g. vip)" value={lp.listKey} onChange={(e) => setList(idx, "listKey", e.target.value)} />
                <div className="flex gap-2">
                  <Input placeholder="Password" value={lp.password} onChange={(e) => setList(idx, "password", e.target.value)} />
                  <Button type="button" variant="outline" onClick={() => removeList(idx)}>Remove</Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addList}>Add another</Button>
          </div>
          <CustomFieldsBuilderForm />
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Saving..." : "Save Event"}</Button>
          </div>
        </form>
      </Form>
    </section>
  );
}
