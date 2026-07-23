"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/types/db";

export type UpdateProfileInput = {
  name?: string;
  first_name?: string;
  last_name?: string;
};

type AuthContextType = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ error: string | null }>;
  updateEmail: (newEmail: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  updateProfile: (updates: UpdateProfileInput) => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    // Check existing session immediately
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser(user);
        // Fetch profile for the authenticated user
        loadProfile(user.id);
      } else {
        setLoading(false);
      }
    }).catch(() => setLoading(false));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        loadProfile(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    setProfileLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) {
        console.error('Failed to load profile:', error.message);
        setProfile(null);
      } else {
        const profileData = data as Profile;
        if (profileData.status === 'suspended') {
          await supabase.auth.signOut();
          window.location.href = '/signin?error=suspended';
          return;
        }
        if (profileData.status === 'deleted') {
          await supabase.auth.signOut();
          window.location.href = '/signin?error=deleted';
          return;
        }
        setProfile(profileData);
      }
    } catch (e) {
      console.error('Profile fetch failed:', e);
      setProfile(null);
    } finally {
      setProfileLoading(false);
      setLoading(false);
    }
  }

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: 'Invalid email or password. Please try again.' };
      return { error: null };
    } catch (e) {
      return { error: 'Sign-in failed. Check your connection and try again.' };
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, name?: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: name || '' } },
      });
      if (error) return { error: error.message, userCreated: false };
      return { error: null, userCreated: !!data?.user };
    } catch (e) {
      const err = e as Error;
      return { error: err?.message || 'Sign-up failed. Please try again.', userCreated: false };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    window.location.href = '/signin';
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { error: error.message };
      return { error: null };
    } catch (e) {
      const err = e as Error;
      return { error: err?.message || 'Failed to change password.' };
    }
  };

  const updateEmail = async (newEmail: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) return { error: error.message, needsConfirmation: false };
      return { error: null, needsConfirmation: true };
    } catch (e) {
      const err = e as Error;
      return { error: err?.message || 'Failed to update email.', needsConfirmation: false };
    }
  };

  const updateProfile = async (updates: UpdateProfileInput) => {
    if (!user) return { error: 'No user logged in.' };
    try {
      setProfileLoading(true);
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();
      if (error) return { error: error.message };
      setProfile(null);
      await loadProfile(user.id);
      return { error: null };
    } catch (e) {
      const err = e as Error;
      return { error: err?.message || 'Failed to update profile.' };
    } finally {
      setProfileLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, profileLoading, signIn, signUp, signOut, changePassword, updateEmail, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
