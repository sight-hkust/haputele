"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/primitives/button";
import { Input, Label } from "@/components/primitives/input";
import { ApiError, api } from "@/lib/api";
import { newPasswordError, PASSWORD_LENGTH_HINT } from "@/lib/credentials";
import { explainError } from "@/lib/error-codes";

export default function DoctorRecoveryPage() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setToken(new URLSearchParams(window.location.hash.slice(1)).get("token") || "");
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || token === null) return;
    setError("");
    if (token) {
      const issue = newPasswordError(password) || (password !== confirm && "Passwords must match.");
      if (issue) {
        setError(issue);
        return;
      }
    }
    setBusy(true);
    try {
      if (token) {
        await api("/auth/doctor-recovery/reset", { method: "POST", body: { token, password } });
        window.history.replaceState(null, "", window.location.pathname);
        setPassword("");
        setConfirm("");
      } else {
        await api("/auth/doctor-recovery/request", { method: "POST", body: { email } });
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? explainError(err.error) : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <BrandLogo />
      <h1 className="text-page-heading">
        {token ? "Choose a new password" : "Doctor password recovery"}
      </h1>
      {done ? (
        <p role="status">
          {token
            ? "Your password has been changed. Sign in with your new password."
            : "If this address is verified for an active doctor account, check your inbox for a reset link. If you need help, contact your clinic administrator."}
        </p>
      ) : (
        token !== null && (
          <form onSubmit={submit} className="flex flex-col gap-4">
            {token ? (
              <>
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder={PASSWORD_LENGTH_HINT}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </>
            ) : (
              <>
                <Label htmlFor="email">Your verified doctor email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  maxLength={255}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </>
            )}
            {error && (
              <p role="alert" className="text-rose-700">
                {error}
              </p>
            )}
            <Button disabled={busy} type="submit">
              {busy ? "Please wait…" : token ? "Save new password" : "Email reset link"}
            </Button>
          </form>
        )
      )}
      <Link href="/login" className="underline">
        Back to sign in
      </Link>
    </main>
  );
}
