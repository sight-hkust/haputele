"use client";

import { NewDoctorSurface } from "@/components/doctors/new-doctor-surface";

export default function NewDoctorPage() {
  return (
    <NewDoctorSurface
      returnHref="/admin"
      backLabel="Back to doctors"
      createdHref={(id) => `/admin/doctors/${id}`}
    />
  );
}
