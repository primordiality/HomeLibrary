-- Home Library — Complete Database Schema (Idempotent)
-- Safe to paste into supabase.com SQL Editor multiple times.
-- Drops all custom objects first, then creates everything fresh.

DROP FUNCTION IF EXISTS set_updated_at_ts() CASCADE;
DROP TABLE IF EXISTS holds CASCADE;
DROP TABLE IF EXISTS borrows CASCADE;
DROP TABLE IF EXISTS book_copies CASCADE;
DROP TABLE IF EXISTS books CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS library_members CASCADE;
DROP TABLE IF EXISTS libraries CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── PROFILES (extends auth.users with name + role) ───
CREATE TABLE profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL DEFAULT '',
    email text,
    role text CHECK (role IN ('system_admin','library_owner','librarian','patron')),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── LIBRARIES ───
CREATE TABLE libraries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    name text NOT NULL,
    address text, description text, phone text, notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Library Members (who belongs to which library) ───
CREATE TABLE library_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id uuid REFERENCES libraries(id) ON DELETE CASCADE,
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    role text CHECK (role IN ('library_owner','librarian','patron')),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── LOCATIONS (rooms/shelves/zones) ───
CREATE TABLE locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id uuid REFERENCES libraries(id) ON DELETE CASCADE,
    name text NOT NULL, floor_or_zone text, notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── BOOKS (master record per ISBN) ───
CREATE TABLE books (
    isbn text PRIMARY KEY, title text, subtitle text,
    authors text[] DEFAULT '{}', publisher text, publish_date date,
    pages integer, language text, cover_url text,
    genres text[] DEFAULT '{}', notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── BOOK COPIES (individual physical items per library) ───
CREATE TABLE book_copies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    book_isbn text REFERENCES books(isbn) ON DELETE CASCADE,
    library_id uuid REFERENCES libraries(id) ON DELETE CASCADE,
    location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
    barcode text, condition text CHECK (condition IN ('new','good','fair','poor','damaged')),
    notes text, purchase_price numeric(10,2), acquired_date date,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── BORROWS (checkout/return with soft nudge dates) ───
CREATE TABLE borrows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patron_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    copy_id uuid REFERENCES book_copies(id) ON DELETE CASCADE,
    checkout_date date NOT NULL,
    nudge_by_date date, return_date date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── HOLDS (reserves for already checked-out books) ───  
CREATE TABLE holds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patron_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    book_isbn text REFERENCES books(isbn) ON DELETE CASCADE,
    library_id uuid REFERENCES libraries(id) ON DELETE CASCADE,
    status text CHECK (status IN ('waiting','accepted','cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ═══ RLS ENABLE ALL TABLES ════
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;  
ALTER TABLE book_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrows ENABLE ROW LEVEL SECURITY;
ALTER TABLE holds ENABLE ROW LEVEL SECURITY;

-- ─── PROFILE POLICIES ───
CREATE POLICY profile_select ON profiles FOR SELECT USING (true);
CREATE POLICY profile_insert ON profiles FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY profile_update ON profiles FOR UPDATE
    USING (EXISTS(SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('system_admin','library_owner')));
CREATE POLICY profile_delete ON profiles FOR DELETE
    USING (EXISTS(SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('system_admin','library_owner')));

-- ─── LIBRARIES POLICIES ───
CREATE POLICY libraries_select ON libraries FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY libraries_all ON libraries FOR ALL USING ("owner_id" = auth.uid());

-- ─── Library MEMBERS POLICIES ───
CREATE POLICY members_select ON library_members FOR SELECT USING (true);
CREATE POLICY members_manage ON library_members FOR ALL
    USING ((SELECT l.owner_id FROM libraries l WHERE l.id = library_members.library_id) = auth.uid());

-- ─── LOCATIONS POLICIES ───  
CREATE POLICY locations_select ON locations FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY locations_all ON locations FOR ALL
    USING ((SELECT l.owner_id FROM libraries l WHERE l.id = library_id) = auth.uid());

-- ─── BOOKS POLICIES ───
CREATE POLICY books_select ON books FOR SELECT USING (true);
CREATE POLICY books_all ON books FOR ALL
    USING ((SELECT l2."owner_id" FROM libraries l2 JOIN book_copies bc ON bc.library_id = l2.id WHERE bc.book_isbn = books.isbn) = auth.uid());

-- ─── Book COPIES POLICIES ───  
CREATE POLICY copies_select ON book_copies FOR SELECT
    USING (EXISTS(SELECT 1 FROM libraries l3 JOIN library_members lm ON lm.library_id = l3.id 
                   WHERE l3.id = book_copies.library_id AND lm.user_id = auth.uid()));
CREATE POLICY copies_all ON book_copies FOR ALL
    USING (EXISTS(SELECT 1 FROM libraries l4 JOIN library_members lm2 ON lm2.library_id = l4.id 
                   WHERE l4.id = book_copies.library_id AND lm2.user_id = auth.uid()));

-- ─── BORROWS POLICIES ───
CREATE POLICY borrows_select_own ON borrows FOR SELECT USING (patron_user_id = auth.uid());
CREATE POLICY borrows_insert_own ON borrows FOR INSERT WITH CHECK (patron_user_id = auth.uid());
CREATE POLICY borrows_manage ON borrows FOR ALL
    USING ((SELECT l5."owner_id" FROM libraries l5 JOIN book_copies bc2 ON bc2.library_id = l5.id 
            WHERE bc2.id = borrows.copy_id) = auth.uid());

-- ─── HOLDS POLICIES ───
CREATE POLICY holds_select_own ON holds FOR SELECT USING (patron_user_id = auth.uid());  
CREATE POLICY holds_insert_own ON holds FOR INSERT WITH CHECK (patron_user_id = auth.uid());
CREATE POLICY holds_manage ON holds FOR ALL
    USING ((SELECT l6."owner_id" FROM libraries l6 WHERE l6.id = holds.library_id) = auth.uid());

-- ─── AUTO-UPDATE TRIGGER FUNCTION ───  
CREATE OR REPLACE FUNCTION set_updated_at_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER tr_libraries_timestamp BEFORE UPDATE ON libraries 
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at_ts();

CREATE TRIGGER tr_book_copies_timestamp BEFORE UPDATE ON book_copies
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at_ts();
