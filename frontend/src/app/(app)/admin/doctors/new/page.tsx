"use client";

import { NewDoctorSurface } from "@/components/doctors/new-doctor-surface";
import { useI18n } from "@/lib/i18n";

export default function NewDoctorPage() {
  const { t } = useI18n();

  return (
    <NewDoctorSurface
      returnHref="/admin"
      backLabel={t("pages.admin.doctors.backToDoctors")}
      createdHref={(id) => `/admin/doctors/${id}`}
    />
  );
}
