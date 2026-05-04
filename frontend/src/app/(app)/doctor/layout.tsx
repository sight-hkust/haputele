import { DoctorNav } from "@/components/doctor/nav";

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DoctorNav />
      {children}
    </>
  );
}
