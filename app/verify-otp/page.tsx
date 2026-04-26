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

type MfaStatusPayload = {
  enrolled?: boolean;
  pendingSetup?: boolean;
  recentlyReset?: boolean;
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
  const [pendingSetup, setPendingSetup] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [setupKey, setSetupKey] = useState<string | null>(null);
  const [resetRequested, setResetRequested] = useState(false);
  const [recentlyReset, setRecentlyReset] = useState(false);
  const [step, setStep] = useState<"setup" | "verify">("setup");

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
        const statusData = (await statusRes.json()) as MfaStatusPayload;
        if (alive) {
          const isEnrolled = Boolean(statusData.enrolled);
          const hasPendingSetup = Boolean(statusData.pendingSetup);
          const requestedStep = searchParams.get("step");

          setEnrolled(isEnrolled);
          setPendingSetup(hasPendingSetup);
          setRecentlyReset(Boolean(statusData.recentlyReset));
          if (requestedStep === "verify" && (isEnrolled || hasPendingSetup)) {
            setStep("verify");
          } else if (isEnrolled) {
            setStep("verify");
          } else {
            setStep("setup");
          }
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
    setPendingSetup(true);
    setSubmitting(false);
  }

  function goToVerifyStep() {
    setStep("verify");
    router.replace("/verify-otp?step=verify");
  }

  function goToSetupStep() {
    setStep("setup");
    router.replace("/verify-otp");
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

  async function handleBackToHome() {
    try {
      await fetch("/api/auth/demo-logout", { method: "POST" });
    } finally {
      window.location.href = "/";
    }
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

        {!loading ? (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
            Step {step === "setup" ? "1 of 2" : "2 of 2"} - {step === "setup" ? "Setup Authenticator" : "Verify OTP"}
          </div>
        ) : null}

        {!loading && step === "setup" ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              {recentlyReset ? "MFA Reset Approved - Setup Required" : "Step 1: Scan QR in Google Authenticator"}
            </p>
            <p className="mt-1 text-xs text-amber-800">
              {recentlyReset
                ? "Your Super Admin approved an MFA reset. Generate a new QR code, then scan it in Google Authenticator."
                : "Generate a QR code and scan it in Google Authenticator before moving to OTP verification."}
            </p>
            <button
              type="button"
              onClick={handleGenerateQr}
              disabled={submitting}
              className="mt-3 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-60"
            >
              {qrDataUrl ? "Regenerate QR Code" : "Generate QR Code"}
            </button>

            {qrDataUrl ? (
              <div className="mt-4 rounded-md bg-white p-3 shadow-sm">
                <Image src={qrDataUrl} alt="MFA QR Code" width={220} height={220} className="mx-auto h-56 w-56" />
                {setupKey ? <p className="mt-2 break-all text-xs text-slate-600">Manual key: {setupKey}</p> : null}
              </div>
            ) : null}

            <button
              type="button"
              onClick={goToVerifyStep}
              disabled={!pendingSetup || submitting}
              className="mt-4 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              I have scanned the QR - Continue to Step 2
            </button>
          </div>
        ) : null}

        {!loading && step === "verify" && !enrolled && !pendingSetup ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            MFA setup is not ready yet. Complete Step 1 first.
          </p>
        ) : null}

        {!loading && step === "verify" && !enrolled ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            Step 2: Enter the 6-digit code from Google Authenticator to finish setup.
          </p>
        ) : null}

        <form onSubmit={handleVerify} className={`mt-5 space-y-4 ${step === "setup" ? "opacity-60" : ""}`}>
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
              disabled={step !== "verify" || (!enrolled && !pendingSetup)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-amber-500 transition focus:ring-2"
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting || step !== "verify" || (!enrolled && !pendingSetup)}
            className="w-full rounded-md bg-gradient-to-r from-yellow-500 to-amber-500 px-3 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-amber-300/50 transition-all hover:from-yellow-400 hover:to-amber-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Verifying..." : "Verify and continue"}
          </button>

          {step === "verify" && !enrolled ? (
            <button
              type="button"
              onClick={goToSetupStep}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Back to Step 1: QR Setup
            </button>
          ) : null}

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

          <button
            type="button"
            onClick={() => {
              void handleBackToHome();
            }}
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Back to Home Page
          </button>
        </form>
      </section>
    </main>
  );
}
