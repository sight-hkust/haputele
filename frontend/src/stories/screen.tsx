import { Component, useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  getRouter,
  useParams,
  usePathname,
  useSearchParams,
} from "@storybook/nextjs-vite/navigation.mock";
import { ReadonlyURLSearchParams } from "next/navigation";
import AppLayout from "@/app/(app)/layout";
import HealthworkerLayout from "@/app/(app)/healthworker/layout";
import DoctorLayout from "@/app/(app)/doctor/layout";
import AdminLayout from "@/app/(app)/admin/layout";
import SysadminLayout from "@/app/(app)/sysadmin/layout";
import Home from "@/app/page";
import Login from "@/app/login/page";
import Setup from "@/app/setup/page";
import Onboarding from "@/app/doctor-onboarding/[token]/page";
import Capture from "@/app/capture/[token]/page";
import NotFound from "@/app/not-found";
import ErrorPage from "@/app/error";
import Appointments from "@/app/(app)/healthworker/appointments/page";
import NewAppointment from "@/app/(app)/healthworker/appointments/new/page";
import HealthworkerAppointment from "@/app/(app)/healthworker/appointments/[id]/page";
import Patients from "@/app/(app)/healthworker/patients/page";
import NewPatient from "@/app/(app)/healthworker/patients/new/page";
import Patient from "@/app/(app)/healthworker/patients/[id]/page";
import PatientProfile from "@/app/(app)/healthworker/patients/[id]/profile/page";
import Queue from "@/app/(app)/healthworker/queue/page";
import HealthworkerAvailability from "@/app/(app)/healthworker/availability/page";
import Exports from "@/app/(app)/healthworker/exports/page";
import Admin from "@/app/(app)/admin/page";
import NewAdminDoctor from "@/app/(app)/admin/doctors/new/page";
import AdminDoctor from "@/app/(app)/admin/doctors/[id]/page";
import Healthworkers from "@/app/(app)/admin/healthworkers/page";
import Doctor from "@/app/(app)/doctor/page";
import DoctorAppointment from "@/app/(app)/doctor/appointments/[id]/page";
import Consultation from "@/app/(app)/doctor/consultations/[id]/page";
import DoctorAvailability from "@/app/(app)/doctor/availability/page";
import DoctorProfile from "@/app/(app)/doctor/profile/page";
import System from "@/app/(app)/sysadmin/page";
import Accounts from "@/app/(app)/sysadmin/accounts/page";
import NewSysadminDoctor from "@/app/(app)/sysadmin/doctors/new/page";

const routes: [RegExp, ComponentType][] = [
  [/^\/$/, Home],
  [/^\/login$/, Login],
  [/^\/setup$/, Setup],
  [/^\/doctor-onboarding\/[^/]+$/, Onboarding],
  [/^\/capture\/[^/]+$/, Capture],
  [/^\/healthworker\/appointments$/, Appointments],
  [/^\/healthworker\/appointments\/new$/, NewAppointment],
  [/^\/healthworker\/appointments\/\d+$/, HealthworkerAppointment],
  [/^\/healthworker\/patients$/, Patients],
  [/^\/healthworker\/patients\/new$/, NewPatient],
  [/^\/healthworker\/patients\/\d+\/profile$/, PatientProfile],
  [/^\/healthworker\/patients\/\d+$/, Patient],
  [/^\/healthworker\/queue$/, Queue],
  [/^\/healthworker\/availability$/, HealthworkerAvailability],
  [/^\/healthworker\/exports$/, Exports],
  [/^\/admin$/, Admin],
  [/^\/admin\/doctors\/new$/, NewAdminDoctor],
  [/^\/admin\/doctors\/\d+$/, AdminDoctor],
  [/^\/admin\/healthworkers$/, Healthworkers],
  [/^\/doctor$/, Doctor],
  [/^\/doctor\/appointments\/\d+$/, DoctorAppointment],
  [/^\/doctor\/consultations\/\d+$/, Consultation],
  [/^\/doctor\/availability$/, DoctorAvailability],
  [/^\/doctor\/profile$/, DoctorProfile],
  [/^\/sysadmin$/, System],
  [/^\/sysadmin\/accounts$/, Accounts],
  [/^\/sysadmin\/doctors\/new$/, NewSysadminDoctor],
];

class RouteBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error?.message.includes("NEXT_HTTP_ERROR_FALLBACK")) return <NotFound />;
    if (this.state.error)
      return <ErrorPage error={this.state.error} reset={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}

// Story-only navigation harness. Production pages, forms, hooks and layout gates
// are unchanged. Router pushes and real links navigate inside the same scenario.
export function Screen({ path }: { path: string }) {
  const [current, navigate] = useState(path);
  const url = new URL(current, "http://storybook.local");
  const pathname = url.pathname;
  usePathname.mockReturnValue(pathname);
  useSearchParams.mockReturnValue(new ReadonlyURLSearchParams(url.searchParams));
  const parts = pathname.split("/").filter(Boolean);
  const id = parts.find((part) => /^\d+$/.test(part));
  useParams.mockReturnValue(
    parts[0] === "capture" || parts[0] === "doctor-onboarding"
      ? { token: parts[1] }
      : id
        ? { id }
        : {},
  );

  useEffect(() => {
    const router = getRouter();
    router.push.mockImplementation((href) => navigate(href));
    router.replace.mockImplementation((href) => navigate(href));
    return () => {
      router.push.mockReset();
      router.replace.mockReset();
      usePathname.mockReset();
      useSearchParams.mockReset();
      useParams.mockReset();
    };
  }, []);

  let Page = routes.find(([pattern]) => pattern.test(pathname))?.[1] ?? NotFound;
  // /healthworker is a server redirect in Next; represent its destination.
  if (pathname === "/healthworker") Page = Appointments;
  let page: ReactNode = (
    <RouteBoundary key={pathname}>
      <Page />
    </RouteBoundary>
  );
  const layouts: Record<string, ComponentType<{ children: ReactNode }>> = {
    healthworker: HealthworkerLayout,
    doctor: DoctorLayout,
    admin: AdminLayout,
    sysadmin: SysadminLayout,
  };
  const Layout = layouts[parts[0]];
  if (Layout)
    page = (
      <AppLayout>
        <Layout>{page}</Layout>
      </AppLayout>
    );

  return (
    <div
      onClickCapture={(event) => {
        const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
        if (
          !link ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey ||
          link.target ||
          link.hasAttribute("download")
        )
          return;
        const destination = link.getAttribute("href");
        if (!destination?.startsWith("/") || destination.startsWith("//")) return;
        event.preventDefault();
        event.stopPropagation();
        navigate(destination);
      }}
    >
      {page}
    </div>
  );
}
