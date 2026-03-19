import { Cpu, Check } from "lucide-react";

/**
 * Step 4 — AI Training
 * Triggers skill initialization (Curator + Reviewer) using all data collected
 * in previous steps. Shows success state and redirects to dashboard.
 *
 * Props:
 *   loading      {boolean}  — true while API call is in flight
 *   trainingDone {boolean}  — true after successful training response
 *   onTrain      {function} — async: calls triggerTraining API
 *   onBack       {function} — navigate back to step 3
 *   onFinish     {function} — navigate to /admin dashboard
 */
export default function AITrainingStep({ loading, trainingDone, onTrain, onBack, onFinish }) {
  return (
    <div className="space-y-6 text-center">

      {/* Icon */}
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
        style={{ backgroundColor: "var(--color-sidebar-bg)" }}
      >
        <Cpu size={28} style={{ color: "var(--color-sidebar-text-active)" }} />
      </div>

      {/* Copy */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--color-input-text)" }}>
          AI Skill Initialization
        </h2>
        <p className="text-sm mt-2 max-w-sm mx-auto" style={{ color: "var(--color-sidebar-text)" }}>
          Reads Curator and Reviewer skill templates, fills them with your company data,
          and generates customized AI skills for your marketing pipeline.
        </p>
      </div>

      {/* Actions */}
      {!trainingDone ? (
        <div className="space-y-3">
          <button onClick={onTrain} disabled={loading} className="btn--accent px-8 py-3">
            {loading
              ? <><span className="spinner" /> Training AI Skills…</>
              : "Start Training"
            }
          </button>
          <div>
            <button onClick={onBack} className="btn--ghost px-6 py-2 text-sm">
              ← Back to Brand Kit
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="alert--success justify-center">
            <Check size={16} strokeWidth={2.5} /> Skills initialized successfully
          </div>
          <button onClick={onFinish} className="btn--primary-full">
            Go to Dashboard →
          </button>
        </div>
      )}

    </div>
  );
}