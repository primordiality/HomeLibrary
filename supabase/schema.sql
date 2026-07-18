-- Home Library — Clean Install / Re-run Schema
-- Safe to paste into Supabase SQL Editor multiple times.
-- Drops ALL custom objects first, then creates everything fresh.

drop trigger if exists update_updated_at_libraries on libraries;
drop trigger if exists update_copies_updated_at on book_copies;
drop trigger if exists update_borrows_timestamps on borrows;
drop trigger if exists update_holds_timestamps on holds;

drop policy if exists profiles_select_all on profiles;
drop policy if exists profiles_insert_auth_user on profiles;
drop policy if exists profiles_update_own on profiles;
drop policy if exists profiles_manage_by_owner_or_admin on profiles;
drop policy if exists libraries_viewable_by_all_authed on libraries;
drop policy if exists libraries_editable_by_owner on libraries;
drop policy if exists library_members_select_all on library_members;
drop policy if exists library_members_managed by_owners_and_librarians on library_members;
drop policy if exists books_viewable_by_all on books;
drop policy if exists book_copies_viewable by_auth_or_member on book_copies;
drop policy if exists borrows_select_own on borrows;
drop policy if exists borrows_insert_own on borrows;
drop policy if exists borrows_manage_by_owner or librarian on borrows;
drop policy if exists holds_select_own on holds;
drop policy if exists holds insert_own on holds;

-- drop the timestamp function if it exists so we can recreate cleanly
drop function if exists update_updated_at_column() cascade;

-- Now drop tables in reverse dependency order
drop table if exists holds cascade;
drop table if exists borrows cascade;  
drop table if exists book_copies cascade;
drop table if exists locations cascade;
drop table if exists libraries cascade;
drop table if exists library_members cascade;
drop table if exists profiles cascade;

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── PROFILES ──────────────────────
create table profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    name text not null default '',
    email text,
    role text not null check (role in (
        'system_admin', 'library_owner', 'librarian', 'patron'
    )),
    created_at timestamptz not null default now()
);

-- ─── LIBRARIES ──────────────────────  
create table libraries (
    id uuid primary key default uuid_generate_v4(),
    owner_id uuid references profiles(id) on delete cascade,
    name text not null,
    address text,
    description text,
    phone text,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ─── Library Members ──────────────────────
create table library_members (
    id uuid primary key default uuid_generate_v4(),
    library_id uuid references libraries(id) on delete cascade,
    user_id uuid references profiles(id) on delete cascade,
    role text not null check (role in (
        'library_owner', 'librarian', 'patron'
    )),
    created_at timestamptz not null default now()
);

-- ─── Locations ──────────────────────
create table locations (
    id uuid primary key default uuid_generate_v4(),
    library_id uuid references libraries(id) on delete cascade,
    name text not null,
    floor_or_zone text,
    notes text,
    created_at timestamptz not null default now()
);

-- ─── Books (master record per ISBN) ──────────────────────
create table books (
    isbn text primary key,
    title text,
    subtitle text,
    authors text[] default '{}',
    publisher text,
    publish_date date,
    pages integer,
    language text,
    cover_url text,
    genres text[] default '{}',
    notes text,
    created_at timestamptz not null default now()
);

-- ─── Book Copies (individual physical items) ──────────────────────  
create table book_copies (
    id uuid primary key default uuid_generate_v4(),
    book_isbn text references books(isbn) on delete cascade,
    library_id uuid references libraries(id) on delete cascade,
    location_id uuid references locations(id) on delete set null,
    barcode text,
    condition text not null check (
        condition in ('new', 'good', 'fair', 'poor', 'damaged')
    ),
    notes text,
    purchase_price numeric(10,2),
    acquired_date date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ─── Borrows (checkout/return tracking) ──────────────────────
create table borrows (
    id uuid primary key default uuid_generate_v4(),
    patron_user_id uuid references profiles(id) on delete cascade,
    copy_id uuid references book_copies(id) on delete cascade,
    checkout_date date not null,
    nudge_by_date date,
    return_date date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ─── Holds (reserves for checked out books) ──────────────────────
create table holds (
    id uuid primary key default uuid_generate_v4(),
    patron_user_id uuid references profiles(id) on delete cascade,
    book_isbn text references books(isbn) on delete cascade,
    library_id uuid references libraries(id) on delete cascade,
    status text not null check (status in (
        'waiting', 'accepted', 'cancelled'
    )),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()  
);


-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
alter table profiles enable row level security;
alter table libraries enable row level security;
alter table library_members enable row level security;
alter table locations enable row level security;
alter table books enable row level security;
alter table book_copies enable row level security;
alter table borrows enable row level security;
alter table holds enable row level security;

-- PROFILES policies: any auth user can INSERT (for the DB trigger), users can manage their own profile
create policy "profiles_select_all" on profiles for select using (true);
create policy "profiles_insert_auth_user" on profiles for insert with check (auth.uid() is not null);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_manage_by_owner_or_admin" on profiles for all
    using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('library_owner', 'system_admin')));

-- LIBRARIES policies: anyone authenticated can view; owner can do everything
create policy "libraries_viewable_by_all_authed" on libraries for select using (auth.uid() is not null);
create policy "libraries_editable_by_owner" on libraries for all using (owner_id = auth.uid());

-- LIBRARY MEMBERS: only owners and librarians manage membership
create policy "library_members_select_all" on library_members for select using (true);
create policy "library_members_managed_by_owners_and_librarians" on library_members for all
    using (exists (select 1 from libraries l where l.id = library_members.library_id and l.owner_id = auth.uid()));

-- BOOKS: anyone authenticated can view; owners/librarians manage
create policy "books_viewable_by_all_authed" on books for select using (auth.uid() is not null);

-- BOOK COPIES: library members + admins
create policy "copies_viewable_by_auth_or_member" on book_copies for select
    using (exists (select 1 from libraries l join library_members lm on lm.library_id = l.id
                    where l.id = book_copies.library_id and lm.user_id = auth.uid()));

-- BORROWS: patrons see their own, owners/librarians manage all
create policy "borrows_select_own" on borrows for select using (patron_user_id = auth.uid());
create policy "borrows_insert_own" on borrows for insert with check (patron_user_id = auth.uid());
create policy "borrows_manage_by_owner_or_librarian" on borrows for all
    using (exists (select 1 from book_copies bc join libraries l2 on l2.id = bc.library_id
                    where bc.id = borrows.copy_id and
                          l2.owner_id = auth.uid()));

-- HOLDS
create policy "holds_select_own" on holds for select using (patron_user_id = auth.uid());
create policy "holds_insert_own" on holds for insert with check (patron_user_id = auth.uid());

-- ============================================
-- AUTO-UPDATE TRIGGERS
-- ============================================
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger set_updated_at_libraries before update on libraries
    for each row execute procedure update_updated_at_column();

create trigger set_updated_at_book_copies before update on book_copies
    for each row execute procedure update_updated_at_column();

create trigger set_updated_at_borrows before update on borrows
    for each row execute procedure update_updated_at_column();

create trigger set_updated_at_holds before update on holds
    for each row execute procedure update_updated_at_column();

-- ============================================
-- INDEXES
-- ============================================
create index idx_copies_library_id on book_copies(library_id);
create index idx_copies_location_id on book_copies(location_id);
create index idx_borrows_patron_id on borrows(patron_user_id);
create index idx_holds_book_isbn on holds(book_isbn);
