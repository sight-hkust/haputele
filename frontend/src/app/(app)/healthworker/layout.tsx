import { HealthworkerNav } from "@/components/healthworker/nav";

// Server-rendered wrapper around the client nav. Adding the secondary nav at
// the layout level keeps every healthworker route in the same chrome.
export default function HealthworkerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HealthworkerNav />
      {children}
    </>
  );
}
