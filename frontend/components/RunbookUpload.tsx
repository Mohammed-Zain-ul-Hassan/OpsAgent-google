"use client";
import { useState } from "react";
import { Upload, CheckCircle, Loader2 } from "lucide-react";

export default function RunbookUpload() {
  const [status, setStatus] = useState<"idle" | "uploading" | "done">("idle");

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setStatus("uploading");

    const formData = new FormData();
    formData.append("file", e.target.files[0]);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    try {
      await fetch(`${API_URL}/upload-runbook`, {
        method: "POST",
        body: formData,
      });
      setStatus("done");
    } catch (err) {
      console.error(err);
      setStatus("idle");
    }
  };

  return (
    <div className="p-4 border-t border-green-900">
      <h3 className="text-xs font-bold text-green-700 mb-2 tracking-widest">KNOWLEDGE BASE</h3>

      <label className="flex items-center gap-2 cursor-pointer bg-green-900/20 hover:bg-green-900/40 p-3 rounded border border-green-900 transition text-xs group">
        <input type="file" className="hidden" accept=".pdf,.txt,.md" onChange={handleUpload} />

        {status === "idle" && <><Upload size={16} className="text-green-600 group-hover:text-green-400" /> <span className="text-green-500">UPLOAD RUNBOOK</span></>}
        {status === "uploading" && <><Loader2 size={16} className="animate-spin text-green-400" /> <span className="text-green-400">INDEXING...</span></>}
        {status === "done" && <><CheckCircle size={16} className="text-green-400" /> <span className="text-green-400 font-bold">ACTIVE</span></>}
      </label>
    </div>
  );
}