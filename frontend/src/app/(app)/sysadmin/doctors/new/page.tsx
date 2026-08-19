"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { NewDoctorSurface } from "@/components/doctors/new-doctor-surface";

function SysadminNewDoctor() {
  // The Accounts page already offers the invite inline, and links here with
  // ?mode=manual when the operator wants to type the full profile instead —
  // so land on that panel rather than making them pick a second time.
  const mode = useSearchParams()?.get("mode");

  return (
    <NewDoctorSurface
      returnHref="/sysadmin/accounts"
      backLabel="Back to accounts"
      initialMode={mode === "manual" ? "manual" : "invite"}
      // The sys-admin has no dedicated doctor detail route: its roster
      // opens a doctor in an inline panel instead. Return there and the
      // freshly-created doctor is in the list.
      createdHref={() => "/sysadmin/accounts"}
    />
  );
}

export default function SysadminNewDoctorPage() {
  // useSearchParams opts the tree into client-side rendering; without a
  // boundary Next fails the static prerender of this route.
  return (
    <Suspense fallback={null}>
      <SysadminNewDoctor />
    </Suspense>
  );
}
