import { redirect } from "next/navigation";

export default function HealthworkerHome() {
  redirect("/healthworker/appointments");
}
