import React, { useState } from "react";
import { Link2, Link2Off, RefreshCw, Loader2, ChevronDown as ChevDown } from "lucide-react";

export default function GoogleAdsPlatformSettings({
  connection, accounts, connecting, loadingAccounts,
  onConnect, onDisconnect, onLoadAccounts, onSelectCustomer,
}) {
  const [showCustomers, setShowCustomers] = useState(false);

  const pillStyle = (color) => ({
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "2px 10px", borderRadius: 999, fontSize: "0.7rem", fontWeight: 700,
    backgroundColor: `rgba(${color},0.12)`, color: `rgb(${color})`,
  });

  const dropdownStyle = {
    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
    border: "1px solid var(--color-card-border)", borderRadius: "8px",
    backgroundColor: "var(--color-card-bg)", boxShadow: "0 4px 16px rgba(0,0,0,.12)",
    maxHeight: "200px", overflowY: "auto",
  };

  const selectorBtnStyle = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    width: "100%", padding: "7px 10px", borderRadius: "7px", fontSize: "0.8rem",
    border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)",
    color: "var(--color-input-text)", cursor: "pointer", textAlign: "left",
  };

  return (
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap",
        padding: "16px", borderRadius: "10px",
        border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)",
      }}>
        {/* Left: status + connect/disconnect */}
        <div style={{ flex: "0 0 auto", minWidth: 180 }}>
          <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-input-text)", marginBottom: 6 }}>
            Google Ads
          </p>

          {connection ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={pillStyle("34,197,94")}>
                <Link2 size={10} /> Connected
              </span>
              <span style={{ fontSize: "0.68rem", color: "var(--color-muted)" }}>
                Token valid until revoked
              </span>

              <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                <button
                  className="btn--inline-action--ghost"
                  onClick={onConnect}
                  disabled={connecting}
                  title="Refresh OAuth token"
                >
                  <RefreshCw size={10} style={connecting ? { animation: "spin 1s linear infinite" } : {}} />
                  Reconnect
                </button>
                <button className="btn--inline-action--ghost" onClick={onDisconnect} style={{ color: "#ef4444" }}>
                  <Link2Off size={10} /> Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div>
              <span style={pillStyle("156,163,175")}>
                <Link2Off size={10} /> Not connected
              </span>
              <div style={{ marginTop: 10 }}>
                <button
                  className="btn--accent"
                  onClick={onConnect}
                  disabled={connecting}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.8rem" }}
                >
                  {connecting
                    ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                    : <Link2 size={12} />}
                  {connecting ? "Opening Google…" : "Connect Google Ads"}
                </button>
                <p style={{ fontSize: "0.68rem", color: "var(--color-muted)", marginTop: 6 }}>
                  Opens Google login in a popup. Requires a Google Ads account.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right: customer account selector (only shown when connected) */}
        {connection && (
          <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
            <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-sidebar-text)", display: "block", marginBottom: 5 }}>
              Customer Account
            </label>
            <button
              style={selectorBtnStyle}
              onClick={() => {
                setShowCustomers((v) => !v);
                if (!accounts) onLoadAccounts();
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {connection.ad_account_name || connection.ad_account_id || "Select customer account…"}
              </span>
              <ChevDown size={12} style={{ flexShrink: 0, marginLeft: 4 }} />
            </button>
            {showCustomers && (
              <div style={dropdownStyle}>
                {loadingAccounts
                  ? <div style={{ padding: "12px", textAlign: "center" }}><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /></div>
                  : accounts?.customers?.length
                    ? accounts.customers.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => { onSelectCustomer(c); setShowCustomers(false); }}
                          style={{ display: "block", width: "100%", padding: "9px 12px", textAlign: "left", fontSize: "0.8rem", color: "var(--color-input-text)", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid var(--color-card-border)" }}
                        >
                          <span style={{ fontWeight: 600 }}>{c.name}</span>
                          <span style={{ fontSize: "0.7rem", color: "var(--color-muted)", marginLeft: 6 }}>{c.id}</span>
                        </button>
                      ))
                    : <p style={{ padding: "10px 12px", fontSize: "0.78rem", color: "var(--color-muted)" }}>No customer accounts found</p>
                }
              </div>
            )}
          </div>
        )}
      </div>
  );
}
