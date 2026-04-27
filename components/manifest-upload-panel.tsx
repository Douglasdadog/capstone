"use client";

import { DragEvent, useState } from "react";
import { toast } from "sonner";

export type ManifestUploadSuccessInfo = {
  id: string;
  fileName: string;
  inserted: number;
  uploadedBy: string;
};

type ManifestUploadPanelProps = {
  onUploadSuccess?: (info: ManifestUploadSuccessInfo) => void | Promise<void>;
  /** Inventory sidebar: tighter typography and padding */
  compact?: boolean;
};

export default function ManifestUploadPanel({ onUploadSuccess, compact = false }: ManifestUploadPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function uploadFile(file: File) {
    if (!window.navigator.onLine) {
      const msg = "Manifest upload requires an internet connection. Reconnect, then upload.";
      setError(msg);
      setSuccess(null);
      toast.error(msg);
      return;
    }
    setUploading(true);
    setError(null);
    setSuccess(null);
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/admin/manifests", {
      method: "POST",
      body: formData
    });
    const payload = (await response.json()) as {
      error?: string;
      inserted?: number;
      manifest?: { id: string; file_name: string; uploaded_by: string };
    };
    if (!response.ok) {
      const msg = payload.error ?? "Manifest upload failed.";
      setError(msg);
      toast.error(msg);
      setUploading(false);
      return;
    }

    const inserted = typeof payload.inserted === "number" ? payload.inserted : 0;
    const manifest = payload.manifest;
    const fileLabel = manifest?.file_name ?? file.name;

    setUploading(false);
    if (manifest?.id) {
      await onUploadSuccess?.({
        id: String(manifest.id),
        fileName: fileLabel,
        inserted,
        uploadedBy: manifest.uploaded_by ?? ""
      });
    } else {
      await onUploadSuccess?.({
        id: "",
        fileName: fileLabel,
        inserted,
        uploadedBy: ""
      });
    }

    toast.success(`Excel manifest added: ${fileLabel}`, {
      description: `${inserted} line(s) imported · Pending verification`
    });

    setSuccess(
      compact
        ? "Manifest uploaded. It is pending verification — an Admin can complete it when ready."
        : "Manifest uploaded and marked as Pending Verification."
    );
    window.setTimeout(() => setSuccess(null), compact ? 6000 : 5000);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  const titleClass = compact
    ? "text-sm font-semibold uppercase tracking-wide text-slate-700"
    : "text-xl font-black text-slate-900";
  const descClass = compact ? "mt-1 text-xs text-slate-600" : "mt-1 text-sm text-slate-600";
  const dropPad = compact ? "p-6" : "p-8";
  const dropTextClass = compact ? "text-xs font-semibold text-slate-700" : "text-sm font-semibold text-slate-700";

  const inner = (
    <>
      <div>
        <h2 className={titleClass}>Excel Manifest Upload</h2>
        <p className={descClass}>
          Upload `.xlsx` or `.csv` with either (Part Number, Batch ID) or (Product, Brand, Battery Type, Product Serial
          ID). Each serial row is counted as 1 quantity.
        </p>
      </div>

      <label
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`block cursor-pointer rounded-xl border-2 border-dashed ${dropPad} text-center transition ${
          isDragging ? "border-amber-500 bg-amber-50" : "border-slate-300 bg-slate-50 hover:bg-slate-100"
        }`}
      >
        <input
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadFile(file);
          }}
        />
        <p className={dropTextClass}>
          {uploading ? "Uploading and parsing manifest..." : "Drop manifest here or click to browse"}
        </p>
      </label>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{success}</p>
      ) : null}
    </>
  );

  if (compact) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="space-y-3">{inner}</div>
      </div>
    );
  }

  return <div className="space-y-5">{inner}</div>;
}
