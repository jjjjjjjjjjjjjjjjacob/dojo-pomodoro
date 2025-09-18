import { redirect } from "next/navigation";

export default function HostIndex() {
  redirect("/host/events");
}

