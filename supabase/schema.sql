-- Home Library — Complete Database Schema
-- Run this in supabase.com → SQL Editor after creating your project

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Profiles table (extends auth.users with role-based info)
create table profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    name text not null default '',
    email text null,
    role text not null check (role in ('system_admin', 'library_owner', 'librarian', 'patron')),
    created_at timestamptz not null default now()
);

-- 2. Libraries — one per physical house/person
create table libraries (
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
create table library_members (
    id uuid primary key default uuid_generate_v4(),
    library_id uuid references libraries(id) on delete cascade,
    user_id uuid references profiles(id) on delete cascade,
    role text not null check (role in ('library_owner', 'librarian', 'patron')),
    created_at timestamptz not null default now()
);

-- 4. Locations within a library (rooms, shelves, zones)
create table locations (
    id uuid primary key default uuid_generate_v4(),
    library_id uuid references libraries(id) on delete cascade,
    name text not null,       -- "Main Shelf", "Reading Nook"
    floor_or_zone text null,
    notes text null,
    created_at timestamptz not null default now()
);

-- 5. Books — bibliographic master record (one row per ISBN)
create table books (
    isbn text primary key,           -- e.g., "978-0441172719"
    title text null,
    subtitle text null,
    authors text[] null,             -- array of names: ["Asimov", "Silverberg"]
    publisher text null,
    publish_date date null,
    pages integer null,
    language text null,              -- ISO 639-1 (e.g., "en")
    cover_url text null,             -- URL to book cover image
    genres text[] null,              -- ["science-fiction", "space-opera"]
    notes text null,                 -- cataloging notes
    created_at timestamptz not null default now()
);

-- 6. Book Copies — individual physical items  
create table book_copies (
    id uuid primary key default uuid_generate_v4(),
    book_isbn text references books(isbn) on delete cascade,
    library_id uuid references libraries(id) on delete cascade,
    location_id uuid references locations(id) on delete set null,
    barcode text null,               -- sticker ISBN (may differ from ISBN if manual label)
    condition text not null check (condition in ('new', 'good', 'fair', 'poor', 'damaged')),
    notes text null,                 -- copy-specific notes
    purchase_price numeric(10,2) null,
    acquired_date date null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 7. Borrow Records — checkout/return tracking
create table borrows (
    id uuid primary key default uuid_generate_v4(),
    patron_user_id uuid references profiles(id) on delete cascade,
    copy_id uuid references book_copies(id) on delete cascade,
    checkout_date date not null,
    nudge_by_date date null,         -- soft reminder target — not enforced
    return_date date null,           -- when set, book is returned
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 8. Hold Queue — reserves for books already checked out
create table holds (
    id uuid primary key default uuid_generate_v4(),
    patron_user_id uuid references profiles(id) on delete cascade,
    book_isbn text references books(isbn) on delete cascade,
    library_id uuid references libraries(id) on delete cascade,
    status text not null check (status in ('waiting', 'accepted', 'cancelled')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ─── ROW LEVEL SECURITY ─────────────────────
-- Enable RLS on every table
alter table profiles enable row level security;
alter table libraries enable row level security;
alter table library_members enable row level security;
alter table locations enable row level security;
alter table books enable row level security;
alter table book_copies enable row level security;
alter table borrows enable row level security;
alter table holds enable row level security;

-- Profiles: users can see all profiles (open catalog)
create policy "profiles_visible_to_all" on profiles for select using (true);

-- Libraries: anyone authenticated can view
create policy "libraries_viewable_by_authenticated" on libraries for select using (auth.uid() is not null);
create policy "libraries_insert_for_auth" on libraries for insert with check (auth.uid() is not null);

-- Library Members: visible to all auth users
create policy "library_members_visible_to_all" on library_members for select using (true);

-- Books: anyone authenticated can see
create policy "books_viewable_to_all" on books for select using (true);

-- Book Copies: visible to authenticated + librarians/owners
create policy "copies_viewable_by_auth_users" on book_copies for select using (
    exists (select 1 from library_members lm 
            where lm.user_id = auth.uid() and lm.library_id = book_copies.library_id)
    or (select u.role from profiles u where u.id = auth.uid()) in ('system_admin', 'library_owner', 'librarian')
);

-- Libraries: owners can CRUD their own
create policy "libraries_editable_by_owner" on libraries for all using (owner_id = auth.uid());
create policy "libraries_deletable_by_owner" on libraries for delete using (owner_id = auth.uid());

-- Library Members: library_owner + system_admin manage
create policy "members_managed_by_owner" on library_members for all using (
    exists (select 1 from libraries l where l.id = library_members.library_id and l.owner_id = auth.uid())
);

-- Book Copies: owners/librarians can CRUD
create policy "copies_editable_by_library_owners" on book_copies for all using (
    exists (select 1 from libraries l where l.id = book_copies.library_id and l.owner_id = auth.uid())
    or exists (select 1 from library_members lm where lm.library_id = book_copies.library_id 
                and lm.user_id = auth.uid() and lm.role in ('library_owner', 'librarian'))
);

-- Borrows: patrons can manage their own, owners/librarians can manage all
create policy "borrows_viewable_by_users" on borrows for select using (
    patron_user_id = auth.uid() or 
    exists (select 1 from library_members lm where lm.user_id = auth.uid() and lm.role in ('library_owner', 'librarian'))
);
create policy "borrows_insert_by_patrons" on borrows for insert with check (
    patron_user_id = auth.uid()
);
create policy "borrows_editable_by_owners" on borrows for all using (
    exists (select 1 from library_members lm 
            join book_copies bc on bc.library_id = lm.library_id 
            where bc.id = borrows.copy_id 
            and lm.user_id = auth.uid() and lm.role in ('library_owner', 'librarian'))
);

-- Holds: patrons can create, library_staff can manage
create policy "holds_viewable_by_patrons_and_owners" on holds for select using (
    patron_user_id = auth.uid() or 
    exists (select 1 from library_members lm where lm.user_id = auth.uid() and lm.role in ('library_owner', 'librarian'))
);
create policy "holds_created_by_patrons" on holds for insert with check (patron_user_id = auth.uid());

-- Functions: auto-update timestamps
create or replace function update_updated_at_column()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;

alter table libraries add constraint updated_at_check check (updated_at is not null);
create trigger set_updated_at before update on libraries for each row execute procedure update_updated_at_column();

alter table book_copies add constraint copies_updated_at_check check (updated_at is not null);
create trigger set_copies_updated_at before update on book_copies for each row execute procedure update_updated_at_column();

alter table borrows add constraint borrows_updated_at_check check (updated_at is not null);
create trigger set_borrows_updated_at before update on borrows for each row execute procedure update_updated_at_column();

alter table holds add constraint holds_updated_at_check check (updated_at is not null);
create trigger set_holds_updated_at before update on holds for each row execute procedure update_updated_at_column();

-- Indexes for performance
create index idx_book_copies_library_id on book_copies(library_id);
create index idx_book_copies_location_id on book_copies(location_id);
create index idx_borrows_patron_id on borrows(patron_user_id);
create index idx_borrows_copy_id on borrows(copy_id);
create index idx_holds_book_isbn on holds(book_isbn);
create index idx_library_members_user_id on library_members(user_id);
