/**
 * M11: My Company
 * Owner: Frontend Dev 2
 * Dependencies: documentsAPI
 *
 * Manage company documents: USP, Compliances, Policies, Marketing Goals
 * Styles: use classes from index.css only — no raw Tailwind color utilities.
 */

import React, { useState, useEffect } from "react";
import { PageWithSidebar, SectionCard } from "../shared/Layout";
import { documentsAPI } from "../../services/api";
import { FileText, Plus, Pencil, Trash2 } from "lucide-react";

const DOC_TYPES = [
  { value: "usp",               label: "USP" },
  { value: "compliance",        label: "Compliance" },
  { value: "policy",            label: "Policies" },
  { value: "marketing_goal",    label: "Marketing Goals" },
  { value: "ethical_guideline", label: "Ethical Guidelines" },
];

export default function MyCompany() {
  const [docs,     setDocs]     = useState([]);
  const [filter,   setFilter]   = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState({ doc_type: "usp", title: "", content: "" });
  const [editing,  setEditing]  = useState(null);

  useEffect(() => {
    documentsAPI.list(filter || undefined).then(setDocs).catch(console.error);
  }, [filter]);

  const handleSave = async () => {
    try {
      if (editing) {
        const updated = await documentsAPI.update(editing, { title: form.title, content: form.content });
        setDocs((p) => p.map((d) => (d.id === editing ? updated : d)));
      } else {
        const created = await documentsAPI.create(form);
        setDocs((p) => [...p, created]);
      }
      setShowForm(false);
      setEditing(null);
      setForm({ doc_type: "usp", title: "", content: "" });
    } catch (err) { alert(err.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this document?")) return;
    await documentsAPI.delete(id);
    setDocs((p) => p.filter((d) => d.id !== id));
  };

  const startEdit = (doc) => {
    setEditing(doc.id);
    setForm({ doc_type: doc.doc_type, title: doc.title, content: doc.content || "" });
    setShowForm(true);
  };

  return (
    <PageWithSidebar>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-header__title">My Company</h1>
          <p className="page-header__subtitle">Manage company documents and policies</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditing(null); setForm({ doc_type: "usp", title: "", content: "" }); }}
          className="btn--accent"
        >
          <Plus size={16} /> Add Document
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setFilter("")} className={!filter ? "filter-tab--active" : "filter-tab"}>
          All
        </button>
        {DOC_TYPES.map((t) => (
          <button key={t.value} onClick={() => setFilter(t.value)}
            className={filter === t.value ? "filter-tab--active" : "filter-tab"}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <SectionCard title={editing ? "Edit Document" : "New Document"} className="mb-6">
          <div className="space-y-4">
            <select
              value={form.doc_type}
              onChange={(e) => setForm((p) => ({ ...p, doc_type: e.target.value }))}
              disabled={!!editing}
              className="field-select"
            >
              {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>

            <input
              placeholder="Document Title"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="field-input"
            />

            <textarea
              placeholder="Document Content"
              rows={6}
              value={form.content}
              onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              className="field-textarea"
            />

            <div className="flex gap-3">
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="btn--ghost">
                Cancel
              </button>
              <button onClick={handleSave} className="btn--primary">
                {editing ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Document list */}
      <div className="space-y-3">
        {docs.map((doc) => (
          <div key={doc.id} className="page-card page-card__body flex items-start justify-between">
            <div className="flex gap-4">
              <FileText size={20} className="shrink-0 mt-0.5" style={{ color: "var(--color-sidebar-text)" }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--color-input-text)" }}>{doc.title}</p>
                <p className="text-xs mt-0.5 capitalize" style={{ color: "var(--color-sidebar-text)" }}>
                  {doc.doc_type?.replace("_", " ")} · v{doc.version}
                </p>
                {doc.content && (
                  <p className="text-sm mt-2 line-clamp-2" style={{ color: "#4b5563" }}>{doc.content}</p>
                )}
              </div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => startEdit(doc)} className="btn--icon">
                <Pencil size={16} />
              </button>
              <button onClick={() => handleDelete(doc.id)} className="btn--icon-danger">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </PageWithSidebar>
  );
}