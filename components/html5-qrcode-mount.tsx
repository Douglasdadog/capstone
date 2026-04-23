"use client";

import { memo } from "react";

type Props = {
  id: string;
  className?: string;
};

/**
 * html5-qrcode injects video/canvas into this div. If the parent re-renders on every
 * manifest fetch / realtime tick, a plain empty <div id="…"/> is reconciled and React
 * removes those foreign DOM nodes — the camera then dies on mobile.
 * This subtree is isolated with stable props so React skips reconciliation here.
 */
export const Html5QrcodeMount = memo(function Html5QrcodeMount({ id, className = "h-full w-full" }: Props) {
  return <div id={id} className={className} />;
});
