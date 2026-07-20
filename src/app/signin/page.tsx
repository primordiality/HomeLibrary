"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function SignIn() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  let _signIn: any = null;
  let _signUp: any = null;
  try { const ctx = useAuth(); _signIn = ctx.signIn; _signUp = ctx.signUp; } catch {}
  const signIn = _signIn;
  const signUp = _signUp;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    if (mode === "signup" && name.trim() === "") {
      setError("Please enter your name.");
      return;
    }

    let result: any;
    if (mode === "login") {
      result = await signIn(email, password);
    } else {
      result = await signUp(email, password, name);
    }

    if (result && result.error) {
      setError(result.error);
    } else {
      // For signup, redirect to pending page instead of dashboard
      if (mode === "signup") {
        window.location.href = "/register/pending";
      } else {
        window.location.href = "/";
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow">
        <h1 className="text-2xl font-bold text-center">
          {mode === "login" ? "Sign In" : "Create Account"}
        </h1>
        
        {error && (
          <div className="p-3 text-red-700 bg-red-50 rounded border border-red-200">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium">Email</label>
            <input
              id="email"
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          
          <div>
            <label htmlFor="password" className="block text-sm font-medium">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          {mode === "signup" && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium">Your Name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>  
          )}

          <button
            type="submit"
            className="w-full px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700"
          >
            {mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div className="text-center">
          <button
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
            className="text-blue-600 hover:underline text-sm"
          >
            {mode === "login" 
              ? "Don't have an account? Sign up" 
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
