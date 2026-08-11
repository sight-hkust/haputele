"use client";

import { NewDoctorSurface } from "@/components/doctors/new-doctor-surface";

export default function SysadminNewDoctorPage() {
  return (
    <NewDoctorSurface
      returnHref="/sysadmin/accounts"
      backLabel="Back to accounts"
      // The sys-admin has no dedicated doctor detail route: its roster
      // opens a doctor in an inline panel instead. Return there and the
      // freshly-created doctor is in the list.
      createdHref={() => "/sysadmin/accounts"}
    />
  );
}
