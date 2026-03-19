/**
 * M11: User Management
 * Owner: Frontend Dev 2
 * Dependencies: usersAPI
 *
 * Add/manage users with roles: Admin, Reviewer, Ethics Reviewer, Publisher
 * Styles: use classes from index.css only — no raw Tailwind color utilities.
 */

import React, { useState, useEffect } from "react";
import { PageWithSidebar, SectionCard } from "../shared/Layout";
import { usersAPI } from "../../services/api";
import { UserPlus, Shield, Eye, Send, Settings } from "lucide-react";

const ROLES = [
  { value: "admin",           label: "Admin",          icon: Settings },
  { value: "reviewer",        label: "Reviewer",       icon: Eye },
  { value: "ethics_reviewer", label: "Ethics Reviewer", icon: Shield },
  { value: "publisher",       label: "Publisher",      icon: Send },
];

export default function UserManagement() {
  const [users,    setUsers]    = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState({ email: "", password: "", full_name: "", role: "reviewer" });
  const [loading,  setLoading]  = useState(false);

  useEffect(() => { usersAPI.list().then(setUsers).catch(console.error); }, []);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const user = await usersAPI.create(form);
      setUsers((p) => [...p, user]);
      setShowForm(false);
      setForm({ email: "", password: "", full_name: "", role: "reviewer" });
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  };

  return (
    <PageWithSidebar>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-header__title">User Management</h1>
          <p className="page-header__subtitle">Add and manage team members for your company</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn--accent">
          <UserPlus size={16} /> Add User
        </button>
      </div>

      {/* Add user form */}
      {showForm && (
        <SectionCard title="Add New User" className="mb-6">
          <div className="grid grid-cols-2 gap-4">
            <input
              placeholder="Full Name"
              value={form.full_name}
              onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
              className="field-input"
            />
            <input
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              className="field-input"
            />
            <input
              placeholder="Password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              className="field-input"
            />
            <select
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              className="field-select"
            >
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          <button
            onClick={handleCreate}
            disabled={loading || !form.email || !form.full_name}
            className="btn--primary mt-4"
          >
            {loading ? (
              <><span className="spinner" /> Creating…</>
            ) : "Create User"}
          </button>
        </SectionCard>
      )}

      {/* Team member list */}
      <SectionCard title={`Team Members (${users.length})`}>
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} style={{
              display:         "flex",
              alignItems:      "center",
              justifyContent:  "space-between",
              padding:         "12px 16px",
              borderRadius:    "10px",
              border:          "1px solid var(--color-card-border)",
              backgroundColor: "var(--color-card-bg)",
              transition:      "background-color 0.15s",
            }}>
              {/* Left: avatar + name + email */}
              <div className="flex items-center gap-3">
                <div className="user-avatar">{u.full_name?.charAt(0)?.toUpperCase()}</div>
                <div>
                  <p className="table-row__title">{u.full_name}</p>
                  <p className="table-row__meta">{u.email}</p>
                </div>
              </div>

              {/* Right: role badge with inline status dot */}
              <div style={{
                display:         "flex",
                alignItems:      "center",
                gap:             "6px",
                padding:         "4px 10px",
                borderRadius:    "20px",
                border:          "1px solid var(--color-card-border)",
                backgroundColor: "var(--color-page-bg)",
              }}>
                <span style={{
                  width:           "7px",
                  height:          "7px",
                  borderRadius:    "50%",
                  flexShrink:      0,
                  backgroundColor: u.is_active ? "var(--color-accent)" : "#f87171",
                  boxShadow:       u.is_active ? "0 0 0 2px var(--color-accent-subtle)" : "none",
                }} />
                <span style={{
                  fontSize:    "0.75rem",
                  fontWeight:  500,
                  color:       "var(--color-input-text)",
                  textTransform: "capitalize",
                  whiteSpace:  "nowrap",
                }}>
                  {u.role?.replace(/_/g, " ")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </PageWithSidebar>
  );
}