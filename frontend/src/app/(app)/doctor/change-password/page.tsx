"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/primitives/button";
import { Input, Label } from "@/components/primitives/input";
import { ApiError, api } from "@/lib/api";
import { newPasswordError, PASSWORD_LENGTH_HINT } from "@/lib/credentials";
import { explainError } from "@/lib/error-codes";

export default function ChangeDoctorPassword() {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const issue =
      newPasswordError(password) || (password !== confirmation && "Passwords must match.");
    if (issue) {
      setError(issue);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/auth/doctor-password/change", {
        method: "POST",
        body: { currentPassword: current, newPassword: password },
      });
      window.location.replace("/login");
    } catch (err) {
      setError(err instanceof ApiError ? explainError(err.error) : "Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="flex max-w-md flex-col gap-4">
      <Link href="/doctor/profile" className="underline">
        Back to my profile
      </Link>
      <h1 className="text-page-heading">Change password</h1>
      <p>After saving, sign in again on each device.</p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Label htmlFor="current">Current password</Label>
        <Input
          id="current"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          placeholder={PASSWORD_LENGTH_HINT}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-rose-700">
            {error}
          </p>
        )}
        <Button disabled={busy} type="submit">
          {busy ? "Saving…" : "Save and sign in again"}
        </Button>
      </form>
    </main>
  );
}
