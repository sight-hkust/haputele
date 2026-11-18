"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/primitives/button";
import { Input, Label } from "@/components/primitives/input";
import type { PublicAccountSupport } from "@/gen/types/PublicAccountSupport";
import { ApiError, api } from "@/lib/api";
import { newPasswordError, PASSWORD_LENGTH_HINT } from "@/lib/credentials";
import { explainError } from "@/lib/error-codes";

export default function ForgotPasswordPage() {
  const [support, setSupport] = useState<PublicAccountSupport | null>(null);
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

  useEffect(() => {
    if (token !== "") return;
    const abort = new AbortController();
    api<PublicAccountSupport>("/auth/account-support", {
      signal: abort.signal,
      cache: "no-store",
      skipAuthRedirect: true,
    })
      .then((data) => {
        if (!abort.signal.aborted) setSupport(data);
      })
      .catch(() => {
        /* Role-specific assistance remains available offline. */
      });
    return () => abort.abort();
  }, [token]);

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
        await api("/auth/password-recovery/reset", { method: "POST", body: { token, password } });
        window.history.replaceState(null, "", window.location.pathname);
        setPassword("");
        setConfirm("");
      } else {
        await api("/auth/password-recovery/request", { method: "POST", body: { email } });
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
      <h1 className="text-page-heading">{token ? "Choose a new password" : "Forgot password?"}</h1>
      {done ? (
        <p role="status">
          {token
            ? "Your password has been changed. Sign in with your new password."
            : "If this email is verified for an active account, we’ll send you a reset link. Check your inbox and spam folder."}
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
                <Label htmlFor="email">Verified account email</Label>
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
      {token === "" && (
        <section aria-labelledby="recovery-help" className="space-y-2 text-sm">
          <h2 id="recovery-help" className="font-semibold">
            No verified email or can’t access your inbox?
          </h2>
          {(support?.email || support?.phone) && (
            <div className="space-y-1">
              <h3 className="font-medium">Contact clinic account support</h3>
              {support.email && (
                <p>
                  <a
                    href={`mailto:${encodeURIComponent(support.email).replace("%40", "@")}`}
                    className="break-all underline"
                  >
                    {support.email}
                  </a>
                </p>
              )}
              {support.phone && (
                <p>
                  <a href={`tel:${support.phone.replace(/[ ().-]/g, "")}`} className="underline">
                    {support.phone}
                  </a>
                </p>
              )}
            </div>
          )}
          <dl className="grid gap-2">
            <div>
              <dt className="font-medium">Health worker or doctor</dt>
              <dd>Contact your clinic administrator.</dd>
            </div>
            <div>
              <dt className="font-medium">Clinic administrator</dt>
              <dd>Contact your system administrator.</dd>
            </div>
            <div>
              <dt className="font-medium">System administrator</dt>
              <dd>Contact the authorized IT operator who manages your HapuTele deployment.</dd>
            </div>
          </dl>
        </section>
      )}
      <Link href="/login" className="underline">
        Back to sign in
      </Link>
    </main>
  );
}
