import { SysAdminNav } from "@/components/sysadmin/nav";

export default function SysAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SysAdminNav />
      {children}
    </>
  );
}
