/**
 * Short beep + vibration after a successful barcode read (used by scanner pages).
 * Audio may stay silent until the user has interacted with the page (browser policy).
 */

export function vibrateOnScanSuccess(): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate([70, 45, 90]);
}

export function playScanBeep(): void {
  if (typeof window === "undefined") return;

  const run = async () => {
    try {
      const w = window as typeof window & { webkitAudioContext?: typeof AudioContext };
      const Ctor = window.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) return;

      const ctx = new Ctor();
      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => undefined);
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);

      const t0 = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.14, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);

      osc.start(t0);
      osc.stop(t0 + 0.18);
      osc.onended = () => {
        void ctx.close();
      };
    } catch {
      // Autoplay / secure context / missing API — ignore
    }
  };

  void run();
}

export function feedbackScanSuccess(): void {
  playScanBeep();
  vibrateOnScanSuccess();
}
