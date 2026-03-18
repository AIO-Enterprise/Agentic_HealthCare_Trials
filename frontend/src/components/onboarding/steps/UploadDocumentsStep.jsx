import React, { useRef, useState } from "react";
import { Upload, X, File, CheckCircle2 } from "lucide-react";
import { DOC_TYPES, ACCEPTED_DOC_FORMATS, ACCEPTED_DOC_MIME } from "../Constants";

// ── helpers ────────────────────────────────────────────────────────────────
const FILE_LABEL = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "text/plain": "TXT",
};

function fileTypeLabel(mime) { return FILE_LABEL[mime] ?? "FILE"; }

function fileSizeStr(bytes) {
  if (bytes < 1024)            return `${bytes} B`;
  if (bytes < 1024 * 1024)     return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Step 2 — Upload Documents (optional)
 *
 * Props:
 *   docs        {array}    — accumulated doc entries
 *   onAddDoc    {function} — (docEntry) => void
 *   onRemoveDoc {function} — (index)   => void
 *   loading     {boolean}
 *   onBack      {function}
 *   onNext      {function}
 */
export default function UploadDocumentsStep({
  docs, onAddDoc, onRemoveDoc, loading, onBack, onNext,
}) {
  const fileInputRef = useRef(null);
  const [selectedType, setSelectedType] = useState(null);
  const [customLabel,  setCustomLabel]  = useState("");
  const [pendingFile,  setPendingFile]  = useState(null);
  const [fileError,    setFileError]    = useState("");

  const isOther    = selectedType === "other";
  const chosenType = DOC_TYPES.find((t) => t.value === selectedType);
  const docTitle   = isOther ? customLabel.trim() : chosenType?.label ?? "";
  const canAdd     = selectedType && pendingFile && (!isOther || customLabel.trim());

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!ACCEPTED_DOC_MIME.includes(file.type)) {
      setFileError("Unsupported format. Please use PDF, DOCX, DOC, or TXT.");
      return;
    }
    setFileError("");
    setPendingFile(file);
  };

  const clearFile = () => {
    setPendingFile(null);
    setFileError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectCategory = (value) => {
    setSelectedType(value);
    setCustomLabel("");
    clearFile();
  };

  const handleAdd = () => {
    if (!canAdd) return;
    onAddDoc({
      doc_type:  selectedType,
      title:     docTitle,
      file:      pendingFile,
      file_name: pendingFile.name,
      file_size: pendingFile.size,
      file_type: pendingFile.type,
    });
    setSelectedType(null);
    setCustomLabel("");
    setPendingFile(null);
    setFileError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
          <h2 className="text-xl font-bold" style={{ color: "var(--color-input-text)" }}>Company Documents</h2>
          <span style={{
            fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.05em",
            padding: "2px 8px", borderRadius: "999px",
            backgroundColor: "rgba(16,185,129,0.12)", color: "var(--color-accent)",
            border: "1px solid rgba(16,185,129,0.25)",
          }}>OPTIONAL</span>
        </div>
        <p className="text-sm mt-1" style={{ color: "var(--color-sidebar-text)" }}>
          Upload your USP, compliance docs, policies, and guidelines.
        </p>
      </div>

      {/* Category pills */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-2"
          style={{ color: "var(--color-sidebar-text)" }}>
          Document Category
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {DOC_TYPES.map((t) => {
            const active       = selectedType === t.value;
            const alreadyAdded = t.value !== "other" && docs.some((d) => d.doc_type === t.value);
            return (
              <button key={t.value} type="button"
                onClick={() => selectCategory(t.value)}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "6px 12px", borderRadius: "999px", fontSize: "0.78rem",
                  fontWeight: active ? 600 : 400, cursor: "pointer",
                  border: `1px solid ${active ? "var(--color-accent)" : "var(--color-input-border)"}`,
                  backgroundColor: active ? "rgba(16,185,129,0.1)" : "var(--color-input-bg)",
                  color: active ? "var(--color-accent)" : "var(--color-input-text)",
                  opacity: (alreadyAdded && !active) ? 0.45 : 1,
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: "0.85rem", lineHeight: 1 }}>{t.icon}</span>
                {t.label}
                {alreadyAdded && (
                  <CheckCircle2 size={11} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom label — only for "Others" */}
      {isOther && (
        <input
          placeholder="Document name (e.g. Brand Story, Org Chart…) *"
          value={customLabel}
          onChange={(e) => setCustomLabel(e.target.value)}
          className="field-input"
          autoFocus
        />
      )}

      {/* File upload — shown once a category is selected */}
      {selectedType && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2"
            style={{ color: "var(--color-sidebar-text)" }}>
            Upload File
          </p>

          {!pendingFile ? (
            <button type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed rounded-lg py-7 flex flex-col items-center gap-2"
              style={{ borderColor: "var(--color-input-border)", backgroundColor: "transparent", cursor: "pointer" }}
            >
              <Upload size={22} style={{ color: "var(--color-sidebar-text)" }} />
              <span style={{ fontSize: "0.85rem", color: "var(--color-sidebar-text)" }}>
                Click to upload
              </span>
              <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", opacity: 0.6 }}>
                PDF · DOCX · DOC · TXT
              </span>
            </button>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "10px 14px", borderRadius: "10px",
              border: "1px solid var(--color-accent)",
              backgroundColor: "rgba(16,185,129,0.07)",
            }}>
              <div style={{
                width: "36px", height: "36px", borderRadius: "6px", flexShrink: 0,
                backgroundColor: "rgba(16,185,129,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.6rem", fontWeight: 700, color: "var(--color-accent)", letterSpacing: "0.03em",
              }}>
                {fileTypeLabel(pendingFile.type)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pendingFile.name}
                </p>
                <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)" }}>
                  {fileSizeStr(pendingFile.size)}{docTitle ? ` · "${docTitle}"` : ""}
                </p>
              </div>
              <button type="button" onClick={clearFile}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", display: "flex" }}>
                <X size={14} style={{ color: "var(--color-sidebar-text)" }} />
              </button>
            </div>
          )}

          {fileError && (
            <p style={{ fontSize: "0.75rem", color: "#ef4444", marginTop: "6px" }}>{fileError}</p>
          )}
          <input ref={fileInputRef} type="file"
            accept={ACCEPTED_DOC_FORMATS} onChange={handleFileChange} className="hidden" />
        </div>
      )}

      {/* Add button */}
      <button onClick={handleAdd} disabled={!canAdd || loading} className="btn--accent-full">
        <File size={15} />
        {loading ? "Adding…" : "Add Document"}
      </button>

      {/* Added docs list */}
      {docs.length > 0 && (
        <div className="rounded-lg overflow-hidden border" style={{ borderColor: "var(--color-card-border)" }}>
          <div className="px-4 py-2.5 border-b"
            style={{ backgroundColor: "var(--color-page-bg)", borderColor: "var(--color-card-border)" }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-sidebar-text)" }}>
              {docs.length} document{docs.length > 1 ? "s" : ""} added
            </p>
          </div>
          {docs.map((d, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b last:border-0"
              style={{ borderColor: "var(--color-card-border)" }}>
              <div style={{
                width: "28px", height: "28px", borderRadius: "5px", flexShrink: 0,
                backgroundColor: "rgba(16,185,129,0.12)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.55rem", fontWeight: 700, color: "var(--color-accent)", letterSpacing: "0.02em",
              }}>
                {fileTypeLabel(d.file_type)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="text-sm font-medium truncate" style={{ color: "var(--color-input-text)" }}>
                  {d.title}
                </p>
                <p style={{ fontSize: "0.7rem", color: "var(--color-sidebar-text)" }}>
                  {d.file_name} · {fileSizeStr(d.file_size)}
                </p>
              </div>
              <button type="button" onClick={() => onRemoveDoc(i)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", display: "flex", flexShrink: 0 }}>
                <X size={13} style={{ color: "var(--color-sidebar-text)" }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3">
        <button onClick={onBack} className="btn--ghost flex-1 py-3">← Back</button>
        <button onClick={onNext} className="btn--primary flex-1 py-3">Next: Brand Kit →</button>
      </div>
    </div>
  );
}