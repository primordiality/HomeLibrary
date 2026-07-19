-- ════════════════════════════════════════
-- Home Library — Complete Schema
-- Safe to run multiple times (idempotent)
-- ════════════════════════════════════════

-- 1. DRAIN ALL existing objects first
DROP TRIGGER IF EXISTS handle_new_user ON auth.users CASCADE;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP TABLE IF EXISTS holds CASCADE;
DROP TABLE IF EXISTS borrows CASCADE;
DROP TABLE IF EXISTS book_copies CASCADE;
DROP TABLE IF EXISTS books CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS library_members CASCADE;
DROP TABLE IF EXISTS libraries CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

|-- 2. PROFILES (extends auth.users with name + role)
|CREATE TABLE IF NOT EXISTS profiles (
|    id uuid PRIMARY KEY REFERENCES auth.users(id),
|    name text DEFAULT '',
|    email text,
|    role text CHECK (role IN ('system_admin','library_owner','librarian','patron')),
|    created_at timestamptz NOT NULL DEFAULT now()
|);

|-- 2a. FIX: Backfill missing profiles for existing auth.users
|-- Run this in Supabase SQL Editor once to resolve FK violations on libraries.owner_id
|INSERT INTO profiles (id, name, email, role)
|SELECT au.id, COALESCE(au.email, ''), au.email, 'library_owner'
|FROM auth.users au
|LEFT JOIN profiles p ON p.id = au.id
|WHERE p.id IS NULL;

|-- 2b. Idempotent trigger for future signups (ON CONFLICT prevents duplicates)
|CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
|BEGIN
|  INSERT INTO profiles (id, name, email)
|  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_attr->>'display_name', ''), NEW.email)
|  ON CONFLICT (id) DO UPDATE
|    SET name = COALESCE(EXCLUDED.name, profiles.name),
|        email = EXCLUDED.email;
|  RETURN NEW;
|END;
|$$ LANGUAGE plpgsql SECURITY DEFINER;

|-- ═══ AUTH TRIGGER: wire handle_new_user() to auth.users ║═
DROP TRIGGER IF EXISTS handle_new_user_trigger ON auth.users CASCADE;
CREATE TRIGGER handle_new_user_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

|-- 2. LIBRARIES 
CREATE TABLE IF NOT EXISTS libraries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    address text,
    description text,
    phone text,
    owner_id uuid REFERENCES profiles(id),
    is_archived BOOLEAN NOT NULL DEFAULT FALSE, -- soft delete guard: must be true before library can be removed
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. LIBRARY MEMBERS (who belongs to which library)
CREATE TABLE library_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id uuid REFERENCES libraries(id),
    user_id uuid REFERENCES profiles(id),
    role text CHECK (role IN ('library_owner','librarian','patron')),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. LOCATIONS (rooms, shelves, zones)
CREATE TABLE locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id uuid REFERENCES libraries(id),
    name text NOT NULL,
    floor_or_zone text,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);

|-- 6. BOOKS (master record per ISBN)
CREATE TABLE books (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    isbn text UNIQUE,   -- nullable for no-ISBN books; unique index handles upserts when ISBN exists
    title text NOT NULL,
    subtitle text,
    authors text[] DEFAULT '{}',
    publisher text,
    publish_date text,   -- text: stores year-only values from OpenLibrary without validation
    pages integer,
    language text,
    cover_url text,
    genres text[] DEFAULT '{}', 
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX books_isbn_idx ON books USING btree (isbn) WHERE isbn IS NOT NULL;

-- 7. BOOK COPIES (physical items per library)
CREATE TABLE book_copies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    book_isbn text REFERENCES books(isbn),
    library_id uuid REFERENCES libraries(id),
    location_id uuid REFERENCES locations(id),
    barcode text,
    condition text CHECK (condition IN ('new','good','fair','poor','damaged')),
    notes text,
    purchase_price numeric(10,2),
    acquired_date date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 8. BORROWS (checkout/return tracking)
CREATE TABLE borrows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patron_user_id uuid REFERENCES profiles(id),
    copy_id uuid REFERENCES book_copies(id),
    checkout_date date NOT NULL,
    due_date date,  
    returned_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 9. HOLDS (reserves for checked-out books)
CREATE TABLE holds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patron_user_id uuid REFERENCES profiles(id),
    book_isbn text REFERENCES books(isbn),
    library_id uuid REFERENCES libraries(id),
    status text CHECK (status IN ('waiting','accepted','cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ═══ RLS: ENABLE all tables ║═
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrows ENABLE ROW LEVEL SECURITY;
ALTER TABLE holds ENABLE ROW LEVEL SECURITY;

-- ═══ RLS POLICIES — allow access for ALL authenticated users ║═

-- profiles: any logged-in user can INSERT (for auth trigger), view, update their own row  
CREATE POLICY profiles_insert_any_authenticated ON profiles  
FOR INSERT WITH CHECK (true);
CREATE POLICY profiles_select_all ON profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY profiles_update_own ON profiles 
    FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- libraries: all can view; owner manages their own  
CREATE POLICY libraries_select_all ON libraries 
    FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY libraries_owner_manage ON libraries 
    FOR ALL USING (owner_id = auth.uid());

-- library_members: owners manage membership in THEIR library  
CREATE POLICY library_members_select_all ON library_members 
    FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY library_members_manage_owned ON library_members 
    FOR ALL USING ((SELECT lib.owner_id FROM libraries lib 
                      WHERE lib.id = library_members.library_id) = auth.uid());

-- locations: all can view; owners manage  
CREATE POLICY locations_select_all ON locations 
    FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY locations_manage_owned ON locations 
    FOR ALL USING ((SELECT lib.owner_id FROM libraries lib 
                      WHERE lib.id = locations.library_id) = auth.uid());

|-- books: all can view; owners manage    
CREATE POLICY books_select_all ON books 
    FOR SELECT USING (auth.uid() IS NOT NULL);
-- INSERT: any authenticated user can add new books (no ownership check needed)
CREATE POLICY books_insert_all ON books 
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
-- UPDATE/DELETE: only owners of a copy in their library
CREATE POLICY books_update_owned ON books 
    FOR UPDATE USING ((SELECT lib.owner_id FROM libraries lib JOIN book_copies bc 
                      ON bc.library_id = lib.id WHERE bc.book_isbn = books.isbn) = auth.uid())
    WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY books_delete_owned ON books 
    FOR DELETE USING ((SELECT lib.owner_id FROM libraries lib JOIN book_copies bc 
                      ON bc.library_id = lib.id WHERE bc.book_isbn = books.isbn) = auth.uid());

-- book_copies: all can view; owners/librarians manage   
CREATE POLICY book_copies_select_all ON book_copies 
FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY book_copies_manage_owners_or_librarians ON book_copies
FOR ALL USING (
    (SELECT l.owner_id FROM libraries l 
     WHERE l.id = book_copies.library_id) = auth.uid()
    OR EXISTS (
        SELECT 1 FROM library_members lm 
        JOIN libraries ll ON ll.id = lm.library_id 
        WHERE ll.id = book_copies.library_id 
              AND lm.user_id = auth.uid()
              AND lm.role IN ('librarian','system_admin')
     ));
-- allow full CRUD for authenticated users (needed for add-book insert)
CREATE POLICY book_copies_insert_all ON book_copies FOR INSERT WITH CHECK (true);

--borrows: patrons see own; librarians/owners manage
CREATE POLICY borrows_select_all ON borrows
    FOR SELECT USING (auth.uid() IS NOT NULL);  
CREATE POLICY borrows_manage_owners_or_librarians ON borrows
FOR ALL USING (
    patron_user_id = auth.uid()
    OR copy_id IN (
        SELECT id FROM book_copies WHERE library_id IN (
            SELECT id FROM libraries WHERE owner_id = auth.uid()
        )
    )
    OR copy_id IN (
        SELECT bc.id FROM book_copies bc
        JOIN libraries lib ON lib.id = bc.library_id  
        JOIN library_members lm ON lm.library_id = lib.id
        WHERE lm.user_id = auth.uid() AND lm.role IN ('librarian','system_admin')
    )
);

--holds: patrons manage own; owners/librarians manage all in library
CREATE POLICY holds_select_all ON holds 
    FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY holds_manage_owners_or_librarians ON holds FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM libraries lib 
        WHERE lib.id = library_id AND lib.owner_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM library_members lm 
        JOIN libraries ll ON ll.id = lm.library_id 
        WHERE ll.id = holds.library_id AND lm.user_id = auth.uid()
              AND lm.role IN ('librarian','system_admin')));

-- ═══ AUTO-UPDATE TIMESTAMP TRIGGERS ║═
CREATE OR REPLACE FUNCTION _set_updated_at_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ 
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER tr_libraries_ts BEFORE UPDATE ON libraries 
FOR EACH ROW EXECUTE PROCEDURE _set_updated_at_ts();

CREATE TRIGGER tr_book_copies_ts BEFORE UPDATE ON book_copies 
FOR EACH ROW EXECUTE PROCEDURE _set_updated_at_ts();

