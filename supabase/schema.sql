-- Home Library — Complete Database Schema (Idempotent)
-- Run in Supabase SQL Editor. Always drops then creates fresh.
-- NOTE: RLS is intentionally permissive until app logic enforces library-scoped access.

DROP FUNCTION IF EXISTS _set_updated_at_ts() CASCADE;

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
    name text DEFAULT '',
    email text,
    role text DEFAULT 'patron',
    created_at timestamptz DEFAULT now()
);

-- ─── LIBRARIES ───
CREATE TABLE libraries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    name text NOT NULL,
    address text, description text, phone text, notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ─── LIBRARY MEMBERS (who belongs to which library) ───
CREATE TABLE library_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id uuid REFERENCES libraries(id) ON DELETE CASCADE,
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    role text CHECK (role IN ('library_owner','librarian','patron')),
    created_at timestamptz DEFAULT now()
);

-- ─── LOCATIONS (rooms, shelves, zones) ───
CREATE TABLE locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id uuid REFERENCES libraries(id) ON DELETE CASCADE,
    name text NOT NULL,
    floor_or_zone text, notes text,
    created_at timestamptz DEFAULT now()
);

-- ─── BOOKS (master record per ISBN) ───
CREATE TABLE books (
    isbn text PRIMARY KEY,
    title text, subtitle text, authors text[] DEFAULT '{}',
    publisher text, publish_date date, pages integer, language text,
    cover_url text, genres text[] DEFAULT '{}', notes text,
    created_at timestamptz DEFAULT now()
);

-- ─── BOOK COPIES (individual physical items per library) ───
CREATE TABLE book_copies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    book_isbn text REFERENCES books(isbn) ON DELETE CASCADE,
    library_id uuid REFERENCES libraries(id) ON DELETE CASCADE,
    location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
    barcode text,
    condition text CHECK (condition IN ('new','good','fair','poor','damaged')),
    notes text, purchase_price numeric(10,2), acquired_date date,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ─── BORROWS (checkout/return with soft nudge dates) ───
CREATE TABLE borrows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patron_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    copy_id uuid REFERENCES book_copies(id) ON DELETE CASCADE,
    checkout_date date NOT NULL,
    nudge_by_date date, return_date date,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ─── HOLDS (reserves for already checked-out books) ───
CREATE TABLE holds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patron_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    book_isbn text REFERENCES books(isbn) ON DELETE CASCADE,
    library_id uuid REFERENCES libraries(id) ON DELETE CASCADE,
    status text CHECK (status IN ('waiting','accepted','cancelled')),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ═══ ENABLE ROW LEVEL SECURITY ─═══
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrows ENABLE ROW LEVEL SECURITY;
ALTER TABLE holds ENABLE ROW LEVEL SECURITY;

-- ═══ PROFILE POLICIES — INSERT MUST be permissive (RLS blocks trigger otherwise) ───
CREATE POLICY profiles_insert_all ON profiles FOR INSERT WITH CHECK (true);
CREATE POLICY profiles_select_all ON profiles FOR SELECT USING (true);
CREATE POLICY profiles_update_own ON profiles FOR UPDATE 
    USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ═══ LIBRARIES POLICIES ───
CREATE POLICY libraries_select_all ON libraries FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY libraries_manage_owner ON libraries FOR ALL 
    USING (owner_id = auth.uid());

-- ═══ LIBRARY MEMBERS POLICIES ───
CREATE POLICY members_select_all ON library_members FOR SELECT USING (true);
CREATE POLICY members_manage OWNER_admin ON library_members FOR ALL
    USING ((SELECT l.owner_id FROM libraries l WHERE l.id = library_members.library_id) = auth.uid());

-- ═══ LOCATIONS POLICIES ───  
CREATE POLICY locations_select_all ON locations FOR SELECT 
    USING (auth.role() = 'authenticated');
CREATE POLICY locations_manage_owner ON locations FOR ALL
    USING ((SELECT l.owner_id FROM libraries l WHERE l.id = library_members.library_id) 
        IN (auth.uid()));

-- ═══ BOOKS POLICIES ───
CREATE POLICY books_select_all ON books FOR SELECT USING (true);

-- ═══ Book COPIES POLICIES ───  
CREATE POLICY copies_manage_owner_member ON book_copies FOR ALL
    USING ((SELECT l.owner_id FROM libraries l 
            JOIN library_members lm ON lm.library_id = l.id
           WHERE l.id = book_copies.library_id AND lm.user_id = auth.uid()));

-- ═══ BORROWS POLICIES ───
CREATE POLICY borrows_select_own ON borrows FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY borrows_insert_own ON borrows FOR INSERT 
    WITH CHECK (patron_user_id = auth.uid());
CREATE POLICY borrows_manage_owner ON borrows FOR ALL
    USING ((SELECT l.owner_id FROM libraries l 
            JOIN book_copies bc ON bc.library_id = l.id
           WHERE bc.id = borrows.copy_id) = auth.uid());

-- ═══ HOLDS POLICIES ───
CREATE POLICY holds_select_own ON holds FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY holds_insert_own ON holds FOR INSERT 
    WITH CHECK (patron_user_id = auth.uid());
CREATE POLICY holds_manage_owner ON holds FOR ALL
    USING ((SELECT l.owner_id FROM libraries l WHERE l.id = holds.library_id) = auth.uid());

-- ═══ AUTO-UPDATE TIMESTAMP TRIGGERS ───  
CREATE OR REPLACE FUNCTION _set_updated_at_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN 
    NEW.updated_at = now(); 
    RETURN NEW;
END; $$;

CREATE TRIGGER set_libs_timestamp BEFORE UPDATE ON libraries 
FOR EACH ROW EXECUTE PROCEDURE _set_updated_at_ts();

CREATE TRIGGER set_copies_timestamp BEFORE UPDATE ON book_copies 
FOR EACH ROW EXECUTE PROCEDURE _set_updated_at_ts();

-- ═══ INDEXES ───  
CREATE INDEX idx_book_copies_library ON book_copies(library_id);
CREATE INDEX idx_book_copies_location ON book_copies(location_id);
CREATE INDEX idx_borrows_patron ON borrows(patron_user_id);
