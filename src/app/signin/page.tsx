'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { signUp } = useAuth();

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!email || !name || !password) {
      setError('Please fill in all fields.');
      setLoading(false);
      return;
    }

    const err = await signUp(email, name, password);
    if (err) {
      // Always show readable error text, never {} or null
      const displayErr = typeof err === 'string' && err.trim() 
        ? err 
        : 'Sign up failed. Check your database configuration and try again.';
      setError(displayErr);
    } else {
      setSuccess(true);
    }
    
    setLoading(false);
  }

  if (success) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">   
         <div className="rounded-xl border bg-white p-8 shadow-sm max-w-md text-center">
            <h1 className="text-2xl font-bold mb-4">Account Created! ✓</h1>
            <p className="mb-6 text-slate-500">{email}</p>
            <div className="space-y-3">   
              <button 
                onClick={() => { window.location.href = '/'; }} 
                className="block w-full rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
               Continue to Dashboard →
              </button>
            </div>
          </div>   
        </div>   
      );   
     }

   return (
       <div className="min-h-screen flex items-center justify-center bg-slate-50">   
         <div className="w-full max-w-md space-y-6 p-8 rounded-xl border bg-white shadow-sm">
           <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create Account</h1>

          {error && (   
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>   
           )}   
          
          <form onSubmit={handleSignUp} className="space-y-4">    
             <div>   
               <label className="block text-sm font-medium text-slate-700">Full Name</label>   
                <input   
                type="text"
                 value={name}   
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                 placeholder="Your Name"   
                />   
              </div>   

             <div>   
               <label className="block text-sm font-medium text-slate-700">Email</label>   
                <input   
                type="email"
                 value={email}   
                onChange={(e) => setEmail(e.target.value)}
                 className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"   
                 placeholder="you@example.com"
               />   
                </div>   

              <div>   
                <label className="block text-sm font-medium text-slate-700">Password</label>   
                 <input
                  type="password"
                   value={password}   
                 onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                   placeholder="min 6 characters"   
                  />
                </div>   

             <button   
              type="submit"   
              disabled={loading}
              className={`w-full cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 ${loading ? 'opacity-50' : ''}`}>
                 {loading ? 'Please wait...' : 'Sign Up'}
                </button>   
             </form>   

           <p className="text-center text-xs text-slate-400">
            Create your account to start managing libraries.
            </p> 
            {/* Optional: link to existing signin */}   
           <p className="text-center text-sm text-slate-500">
            Already have an account?{' '}
              <a href="/signin" className="cursor-pointer font-medium text-indigo-600 hover:text-indigo-800">Sign in</a>
            </p>   
          </div> 
        </div>
      );   
     }
