"use client";

import Image from "next/image";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { normalizeRole, resolvePostLoginPath } from "@/lib/auth/roles";

type SessionPayload = {
  email?: string;
  role?: string;
  mfaVerified?: boolean;
};

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={<main className="mx-auto flex min-h-screen max-w-md items-center px-6">Loading...</main>}>
      <VerifyOtpContent />
    </Suspense>
  );
}

function VerifyOtpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [enrolled, setEnrolled] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [setupKey, setSetupKey] = useState<string | null>(null);
  const [resetRequested, setResetRequested] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const sessionRes = await fetch("/api/auth/session");
        if (!sessionRes.ok) {
          router.push("/login");
          return;
        }

        const session = (await sessionRes.json()) as SessionPayload;
        if (session.mfaVerified) {
          const nextPath = resolvePostLoginPath(normalizeRole(session.role), searchParams.get("redirectedFrom"));
          router.push(nextPath);
          return;
        }

        const statusRes = await fetch("/api/auth/mfa/status");
        const statusData = (await statusRes.json()) as { enrolled?: boolean };
        if (alive) {
          setEnrolled(Boolean(statusData.enrolled));
        }
      } catch {
        if (alive) {
          setError("Unable to load MFA status.");
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [router, searchParams]);

  async function handleGenerateQr() {
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/auth/mfa/setup", { method: "POST" });
    const data = (await res.json()) as { error?: string; qrDataUrl?: string; setupKey?: string };
    if (!res.ok) {
      setError(data.error ?? "Unable to generate QR code.");
      setSubmitting(false);
      return;
    }

    setQrDataUrl(data.qrDataUrl ?? null);
    setSetupKey(data.setupKey ?? null);
    setSubmitting(false);
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/auth/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: otpCode })
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "OTP verification failed.");
      setSubmitting(false);
      return;
    }

    const sessionRes = await fetch("/api/auth/session");
    const sessionData = (await sessionRes.json()) as SessionPayload;
    const nextPath = resolvePostLoginPath(normalizeRole(sessionData.role), searchParams.get("redirectedFrom"));
    router.push(nextPath);
    router.refresh();
  }

  async function handleMfaResetRequest() {
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/auth/mfa/request-reset", { method: "POST" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Unable to submit reset request.");
      setSubmitting(false);
      return;
    }
    setResetRequested(true);
    setSubmitting(false);
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-6 py-10">
      <section className="w-full max-w-md rounded-2xl border border-white/15 bg-white/95 p-7 shadow-2xl">
        <p className="mb-2 text-2xl font-black italic leading-none text-red-600">imarflex.</p>
        <h1 className="text-2xl font-black text-slate-900">Verify OTP</h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter your one-time code from Google Authenticator to continue to the dashboard.
        </p>

        {loading ? <p className="mt-4 text-sm text-slate-500">Loading MFA setup...</p> : null}

        {!loading && !enrolled ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">MFA Setup Required</p>
            <p className="mt-1 text-xs text-amber-800">
              Generate a QR code, scan it with Google Authenticator, then enter the 6-digit code below.
            </p>
            <button
              type="button"
              onClick={handleGenerateQr}
              disabled={submitting}
              className="mt-3 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-60"
            >
              Generate QR Code
            </button>

            {qrDataUrl ? (
              <div className="mt-4 rounded-md bg-white p-3 shadow-sm">
                <Image src={qrDataUrl} alt="MFA QR Code" width={220} height={220} className="mx-auto h-56 w-56" />
                {setupKey ? <p className="mt-2 break-all text-xs text-slate-600">Manual key: {setupKey}</p> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {!loading && enrolled ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            MFA is already enrolled for this account. Enter your current OTP code.
          </p>
        ) : null}

        <form onSubmit={handleVerify} className="mt-5 space-y-4">
          <div>
            <label htmlFor="otp" className="mb-1 block text-sm font-medium text-slate-700">
              One-Time Password
            </label>
            <input
              id="otp"
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              pattern="[0-9]{6}"
              placeholder="123456"
              required
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-amber-500 transition focus:ring-2"
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-gradient-to-r from-yellow-500 to-amber-500 px-3 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-amber-300/50 transition-all hover:from-yellow-400 hover:to-amber-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Verifying..." : "Verify and continue"}
          </button>

          {!resetRequested ? (
            <button
              type="button"
              onClick={() => void handleMfaResetRequest()}
              disabled={submitting}
              className="w-full text-center text-xs font-medium text-slate-600 underline-offset-2 hover:text-red-600 hover:underline disabled:opacity-60"
            >
              Lost your device? Request an MFA Reset from Admin.
            </button>
          ) : (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Request Sent. Please contact your supervisor or wait for an email confirmation once the Admin has
              processed your reset.
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
