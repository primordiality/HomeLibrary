'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type Profile = null | { id: string; name: string; email: string; role: string };

export interface AuthContextType {
  session: any;
  profile: Profile;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<string | null>;
  signUp: (email: string, name: string, pass: string) => Promise<string | null>;  
  signOut: () => Promise<void>;
  isLoggedIn: boolean;
}

const Ctx = createContext<AuthContextType>({
  session: null, profile: null, loading: true,
  signIn: async (_, __) => 'Error',
  signUp: async (_, __, ___) => 'Error', 
  signOut: async () => {},
  isLoggedIn: false,
});

export function useAuth() { return useContext(Ctx); }

// ─── Auth provider that actually works ───
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile>(null);
  const [loading, setLoading] = useState(true);

  // On initial mount: fetch the session from Supabase and load the profile
  useEffect(() => {
    async function loadAuthState() {
      try {
        // Get any existing session
        const { data: s } = await supabase.auth.getSession();
        if (s.session) {
          setSession(s.session);
          
          // Fetch profile for this user  
          const { data: p, error: pErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', s.session.user.id)
            .single();
          
          if (p && !pErr) {
            setProfile(p as Profile);
          } else {
            console.warn('No profile found, session exists:', pErr?.message);
            // If session exists but no profile, the user may have been created
            // outside our app and the trigger didn't fire. Treat as auth user anyway.
            setProfile({ id: s.session.user.id, name: 'Unknown', email: s.session.user.email || '', role: 'patron' });
          }
        }
      } catch (err) {
        console.error('Failed to load auth state:', err);
      } finally {
        setLoading(false);
      }
    }
    
    loadAuthState();

    // Listen for future auth changes  
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (newSession) {
        setSession(newSession);
        // Load profile for this user
        supabase.from('profiles').select('*').eq('id', newSession.user.id).single().then(({ data: p }) => {
          if (p) setProfile(p as Profile);
        });
      } else {
        setSession(null);
        setProfile(null);
      }
    });

    return () => { listener?.subscription.unsubscribe(); };
  }, []);

  const signIn = async (email: string, pass: string): Promise<string | null> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) return error.message;
      return null; // success
    } catch (err: any) {
      return err.message || 'Sign in failed';
    }
  };

  const signUp = async (email: string, name: string, pass: string): Promise<string | null> => {
    try {
      // Sign up AND create the profile in one call  
      const { data, error } = await supabase.auth.signUp({
        email,
        password: pass,
        options: {
          data: { display_name: name },
        },
      });

      if (error) return error.message;

      // If auth user created successfully, the DB trigger should auto-create profiles row  
      // but if not (or we need it immediately), create it manually here
      if (data?.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          name: name,
          email: email,
          role: 'patron',
        });
      }

      return null; // success  
    } catch (err: any) {
      return err.message || 'Sign up failed';
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      
      // ALWAYS clear local state and reload the page to fully reset auth
      setSession(null);  
      setProfile(null);
      
      // Force full page refresh after session is cleared
      window.location.href = '/signin';
      
    } catch (err: any) {
      console.error('Sign out error:', err);
      // Force redirect anyway as fallback
      setSession(null);
      setProfile(null);
      window.location.href = '/signin';
    }
  };

  return (
    <Ctx.Provider value={{
      session,
      profile,
      loading,
      signIn,
      signUp,
      signOut,
      isLoggedIn: !!session && !!profile,
    }}>
      {children}
    </Ctx.Provider>
  );
}
