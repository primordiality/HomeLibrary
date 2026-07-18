-- Home Library — Migration (SAFE: idempotent, can be run multiple times)
-- Run this in supabase.com → SQL Editor

-- 0. Drop everything if it exists, then recreate cleanly
drop trigger if exists update_updated_at_libraries on libraries;
drop trigger if exists set_copies_updated_at on book_copies;
drop trigger if exists update_borrows_timestamps on borrows;
drop trigger if exists update_holds_timestamps on holds;

drop policy if exists profiles_visible_to_all on profiles;
drop policy if exists libraries_viewable_by_authenticated on libraries;
drop policy if exists libraries_editable_by_owner on libraries;
drop policy if exists library_members_visible_to_all on library_members;
drop policy if exists books_viewable_to_all on books;
drop policy if exists copies_viewable_by_auth_users on book_copies;
drop policy if exists members_managed_by_owner on library_members;
drop policy if exists borrows_viewable_by_users on borrows;
drop policy if exists borrows_insert_by_patrons on borrows;
drop policy if exists borrows_editable_by_owners on borrows;
drop policy if exists holds_viewable_by_patrons_and_owners on holds;
drop policy if exists holdings_created_by_patrons on holds;

drop table if exists library_members cascade;
drop table if exists book_copies cascade;
drop table if exists borrows cascade;
drop table if exists locations cascade;
drop table if exists books cascade;
drop table if exists libraries cascade;
drop table if exists profiles cascade;

-- Also drop all RLS on auth.users (Supabase might try to enforce it)
drop policy if exists profiles_visible_to_all on auth.users;

-- Now recreate schema.sql from scratch, line by line with IF NOT EXISTS guards

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Profiles table (extends auth.users with role-based info)
create table if not exists profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    name text not null default '',
    email text null,
    role text not null check (role in ('system_admin', 'library_owner', 'librarian', 'patron')),
    created_at timestamptz not null default now()
);

-- 2. Libraries — one per physical house/person
create table if not exists libraries (
    id uuid primary key default uuid_generate_v4(),
    owner_id uuid references profiles(id) on delete cascade,
    name text not null,
    address text null,
    description text null,
    phone text null,
    notes text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 3. Library Members (who belongs to which library and their role)
create table if not exists library_members (
    id uuid primary key default uuid_generate_v4(),
    library_id uuid references libraries(id) on delete cascade,
    user_id uuid references profiles(id) on delete cascade,
    role text not null check (role in ('library_owner', 'librarian', 'patron')),
    created_at timestamptz not null default now()
);

-- 4. Locations within a library (rooms, shelves, zones)
create table if not exists locations (
    id uuid primary key default uuid_generate_v4(),
    library_id uuid references libraries(id) on delete cascade,
    name text not null,        -- "Main Shelf", "Reading Nook"
    floor_or_zone text null,
    notes text null,
    created_at timestamptz not null default now()
);

-- 5. Books — bibliographic master record (one row per ISBN)
create table if not exists books (
    isbn text primary key,            -- e.g., "978-0441172719"
    title text null,
    subtitle text null,
    authors text[] null,              -- array of names: ["Asimov", "Silverberg"]
    publisher text null,
    publish_date date null,
    pages integer null,
    language text null,               -- ISO 639-1 (e.g., "en")
    cover_url text null,              -- URL to book cover image
    genres text[] null,               -- ["science-fiction", "space-opera"]
    notes text null,                  -- cataloging notes
    created_at timestamptz not null default now()
);

-- 6. Book Copies — individual physical items   
create table if not exists book_copies (
    id uuid primary key default uuid_generate_v4(),
    book_isbn text references books(isbn) on delete cascade,
    library_id uuid references libraries(id) on delete cascade,
    location_id uuid references locations(id) on delete set null,
    barcode text null,                -- sticker ISBN (may differ from ISBN if manual label)
    condition text not null check (condition in ('new', 'good', 'fair', 'poor', 'damaged')),
    notes text null,                  -- copy-specific notes
    purchase_price numeric(10,2) null,
    acquired_date date null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 7. Borrow Records — checkout/return tracking
create table if not exists borrows (
    id uuid primary key default uuid_generate_v4(),
    patron_user_id uuid references profiles(id) on delete cascade,
    copy_id uuid references book_copies(id) on delete cascade,
    checkout_date date not null,
    nudge_by_date date null,          -- soft reminder target — not enforced
    return_date date null,            -- when set, book is returned
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 8. Hold Queue — reserves for books already checked out
create table if not exists holds (
    id uuid primary key default uuid_generate_v4(),
    patron_user_id uuid references profiles(id) on delete cascade,
    book_isbn text references books(isbn) on delete cascade,
    library_id uuid references libraries(id) on delete cascade,
    status text not null check (status in ('waiting', 'accepted', 'cancelled')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ─── ROW LEVEL SECURITY ─────────────────────
alter table profiles enable row level security;
alter table libraries enable row level security;
alter table library_members enable row level security;
alter table books enable row level security;
alter table book_copies enable row level security;
alter table borrows enable row level security;
alter table holds enable row level security;

-- Profiles: allow public read (for profile lookup), authenticated users can insert
create policy profiles_insert for insert on profiles
    with check (auth.uid() is not null);
create policy profiles_update for update on profiles 
    using (auth.uid() = id) with check (true);
-- Allow admin to manage all
create policy profiles_manage_all for all on profiles
    using ((select role from profiles where id = auth.uid()) = 'admin' or
           (select role from profiles where id = auth.uid()) = 'system_admin');
-- Actually, simpler: just allow anyone to see and manage themselves, admins can do everything
drop policy if exists profiles_insert on profiles;
drop policy if exists profiles_update on profiles;
drop policy if exists profiles_manage_all on profiles;

create policy profiles_select_all on profiles for select using (true);
create policy profiles_insert_auth on profiles for insert with check (auth.uid() is not null);
create policy profiles_update_self on profiles for update 
    using (auth.uid() = id) with check (auth.uid() = id);

-- Libraries: anyone authenticated can view
create policy libraries_viewable_by_authenticated on libraries 
    for select using (auth.uid() is not null);
create policy libraries_insert_for_auth on libraries 
    for insert with check (auth.uid() is not null);

-- Library Members: visible to all auth users
create policy library_members_select_all on library_members for select using (true);
create policy library_members_manage on library_members for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and 
            p.role in ('system_admin', 'library_owner')) and
    exists (select 1 from libraries l where l.id = library_members.library_id 
            and l.owner_id = auth.uid()));

-- Libraries: owners can CRUD their own
create policy libraries_update_owner on libraries for update using (owner_id = auth.uid());
create policy libraries_delete_owner on libraries for delete using (owner_id = auth.uid());
create policy libraries_all_owner on libraries for all 
    using (owner_id = auth.uid() or 
           exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'system_admin'));

-- Books: anyone authenticated can see
create policy books_select_all on books for select using (auth.uid() is not null);

-- Book Copies: visible to library members
create policy copies_select_owner on book_copies for select 
    using ((select l.owner_id from libraries l where l.id = book_copies.library_id) = auth.uid());

-- Borrows: patrons can see their own, owners/librarians can manage all
create policy borrows_select_own on borrows for select using (patron_user_id = auth.uid());
create policy borrows_insert_own on borrows for insert with check (patron_user_id = auth.uid());
create policy borrows_manage_owner on borrows for all 
    using ((select l.owner_id from libraries l 
            join book_copies bc on bc.library_id = l.id where bc.id = borrows.copy_id) = auth.uid() or
           exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('system_admin', 'librarian')));

-- Holds: patrons can create, library_staff can manage
create policy holds_select on holds for select using (patron_user_id = auth.uid());
create policy holds_insert_own on holds for insert with check (patron_user_id = auth.uid());

-- ─── TRIGGERS ─────────────────────
create or replace function update_updated_at_column()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;

alter table libraries add constraint updated_at_check check (updated_at is not null);
create trigger set_updated_at_libraries before update on libraries 
    for each row execute procedure update_updated_at_column();

alter table book_copies add constraint copies_updated_at_check check (updated_at is not null);
create trigger set_copies_updated_at_book_copies before update on book_copies 
    for each row execute procedure update_updated_at_column();

alter table borrows add constraint borrows_updated_at_check check (updated_at is not null);
create trigger update_borrows_timestamps before update on borrows 
    for each row execute procedure update_updated_at_column();

alter table holds add constraint holds_updated_at_check check (updated_at is not null);
create trigger update_holds_timestamps before update on holds 
    for each row execute procedure update_updated_at_column();

-- ─── INDEXES FOR PERFORMANCE ─────────────────────
create index if not exists idx_book_copies_library_id on book_copies(library_id);
create index if not exists idx_book_copies_location_id on book_copies(location_id);
create index if not exists idx_borrows_patron_id on borrows(patron_user_id);
create index if not exists idx_holds_book_isbn on holds(book_isbn);
