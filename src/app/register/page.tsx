"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase/client";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState<boolean | null>(null);
  const router = useRouter();

  const { signUp } = useAuth();

  // Check if public registration is available anywhere
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("library_settings")
          .select("library_id, allow_public_registration")
          .eq("allow_public_registration", true)
          .limit(1);

        if (!error && data && data.length > 0) {
          setRegistrationEnabled(true);
        } else {
          setRegistrationEnabled(false);
        }
      } catch {
        setRegistrationEnabled(false);
      }
    })();
  }, []);

  // Show "not available" page when registration is disabled
  if (registrationEnabled === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-lg text-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Librarium</h1>
          </div>

          <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">Registration Not Available</h2>
            <p className="text-sm text-slate-500">
              Public registration is currently disabled. No library in the system
              has enabled public sign-up at this time.
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-left space-y-1">
            <p className="text-sm text-slate-600">
              <span className="font-medium">What can you do?</span>
            </p>
            <ul className="text-sm text-slate-500 list-disc list-inside space-y-1">
              <li>Contact a library administrator to request an account</li>
              <li>An admin can create an account and send you an invite email</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <a
              href="/signin"
              className="flex-1 px-4 py-2.5 text-center text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 font-medium transition"
            >
              Sign In
            </a>
            <a
              href="/"
              className="flex-1 px-4 py-2.5 text-center text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 font-medium transition"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  // While loading the registration status, show nothing (or a loading state)
  if (registrationEnabled === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center text-slate-500">Loading…</div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password || !name.trim()) {
      setError("All fields are required.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    const result = await signUp(email, password, name);
    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      router.push("/register/pending");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-lg">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Librarium</h1>
        </div>

        {error && (
          <div className="p-3 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <h2 className="text-center text-lg font-semibold text-slate-900">
          Create Account
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Jane Doe"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="jane@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={6}
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="At least 6 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2.5 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition"
          >
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <div className="text-center">
          <a href="/signin" className="text-sm text-blue-600 hover:underline">
            Already have an account? Sign in
          </a>
        </div>
      </div>
    </div>
  );
}
