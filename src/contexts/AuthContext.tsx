'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type Session = null | Record<string, any>;
type Profile = null | { email: string; name: string };

export interface AuthContextType {  
  session: Session;
  profile: Profile;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<string | null>;
  signUp: (email: string, name: string, pass: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthContextType>({
  session: null, profile: null, loading: true,
  signIn: async (_, __) => 'Error',
  signUp: async (_, __, ___) => 'Error',
   signOut: async () => {},
});

export function useAuth() { return useContext(Ctx); }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [profile, setProfile] = useState<Profile>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
     supabase.auth.getSession().then(({ data: s }) => setSession(s.session || null));  
    const { data } = supabase.auth.onAuthStateChange(async (_ev, s) => {
       setSession(s || null);
      if (s?.user) {
         const { data: p } = await supabase
           .from('profiles')
           .select('*')
           .eq('id', s.user.id)
           .single();
         setProfile(p as Profile);
       } else {  
         setProfile(null);
       }
       setLoading(false);
     });
    return () => { data.subscription.unsubscribe(); };
  }, []);

   const signIn = async (email: string, pass: string) => {
     const { error } = await supabase.auth.signInWithPassword({ email, password: pass });  
     return error?.message ?? null;
   };
   
  const signUp = async (email: string, name: string, pass: string) => {
     // First create auth user
    const { error: authErr } = await supabase.auth.signUp({ email, password: pass, options: { data: { display_name: name } } });
    if (authErr) return authErr.message;
    
    // Then create profile (retry in case trigger hasn't fired yet)  
    for (let i = 0; i < 3 && !profile; i++) {
       await new Promise(r => setTimeout(r, 500 * (i + 1)));
      const { data: p } = await supabase.from('profiles').select('*').eq('id', session?.user?.id).single();
      if (p) setProfile(p as Profile);  
    }
    
    return null; // success  
   };

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
     <Ctx.Provider value={{ session, profile, loading, signIn, signUp, signOut }}>
       {children}
     </Ctx.Provider>
   );
}

// ═══ Profile migration — run this in the Supabase SQL Editor: ═══
/*  
create table if not exists profiles (
   id uuid primary key references auth.users(id) on delete cascade,
   email text null,
   name text not null default '',
   avatar_url text null,  -- profile photo (supabase storage URL)
   role text not null check (role in ('system_admin',
'library_owner', 'librarian', 'patron')),
   created_at timestamptz not null default now()  
);

create or replace function handle_new_user()  
returns trigger as $$ begin
  insert into profiles (id, name, role) 
    values (new.id, coalesce(new.email::text, ''), 'patron')  
    on conflict (id) do nothing;
  return new;  
end; $$ language plpgsql;

create trigger on_auth_user_created  
after insert on auth.users for each row execute procedure handle_new_user();
*/
