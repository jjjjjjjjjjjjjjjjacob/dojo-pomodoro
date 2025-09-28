"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DoorPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/door/scan");
  }, [router]);

  return null;
}