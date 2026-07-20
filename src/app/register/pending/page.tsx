"use client";

import { useAuth } from "@/contexts/AuthContext";

export default function PendingApproval() {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-lg text-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Librarium</h1>
        </div>

        <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Account Pending Approval</h2>
          <p className="text-sm text-slate-500">
            Thank you for signing up! Your account has been created and is awaiting
            review by an administrator. You&rsquo;ll be notified once your account is approved.
          </p>
        </div>

        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-left space-y-1">
          <p className="text-sm text-slate-600">
            <span className="font-medium">What happens next?</span>
          </p>
          <ul className="text-sm text-slate-500 list-disc list-inside space-y-1">
            <li>An admin will review your registration</li>
            <li>Once approved, your account status changes to <span className="font-medium text-slate-700">active</span></li>
            <li>You&rsquo;ll then be able to sign in and browse the catalog</li>
          </ul>
        </div>

        <button
          onClick={signOut}
          className="w-full px-4 py-2.5 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 font-medium transition"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
