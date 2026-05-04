"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Booking lives inside the appointments workspace now (calendar always visible).
// This route exists only to forward deep-links — patient detail page links to
// `/healthworker/appointments/new?patientId=N` to open the booking form prefilled.
export default function NewAppointmentRedirect() {
  return (
    <Suspense fallback={null}>
      <Redirector />
    </Suspense>
  );
}

function Redirector() {
  const router = useRouter();
  const sp = useSearchParams();
  useEffect(() => {
    const qs = new URLSearchParams();
    qs.set("tab", "book");
    const patientId = sp.get("patientId");
    if (patientId) qs.set("patientId", patientId);
    router.replace(`/healthworker/appointments?${qs.toString()}`);
  }, [router, sp]);
  return null;
}
