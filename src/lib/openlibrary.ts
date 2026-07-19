/**
 * OpenLibrary API client — fetch book metadata by ISBN.
 * All endpoints return `{ docs: [...] }`, NOT `books`.
 */
const BASE = 'https://openlibrary.org';

function ok(res: Response) {
  if (!res.ok) throw new Error(`OpenLibrary request failed (${res.status})`);
  return res.json();
}

// ── ISBN lookup (Primary + fallback strategies) ────────────────
async function fetchBookByIsbn(isbnRaw: string): Promise<{
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishDate?: string;
  pages?: number;
  coverUrl?: string;
}|null> {
  const cleaned = isbnRaw.replace(/[-\s]/g, '').trim();
  if (cleaned.length !== 10 && cleaned.length !== 13) return null;

  // Strategy A: /search.json?q=isbn:XX
  try {
    const res = await fetch(
      `${BASE}/search.json?q=isbn:${encodeURIComponent(cleaned)}&limit=3`
    );
    const data: any = await ok(res);
    if (data?.docs?.length > 0) {
      const b = data.docs[0];
      return {
        title: b.title,
        subtitle: undefined,
        authors: b.author_name?.slice(0, 3),
        publisher: b.publisher_name?.[0],
        publishDate: b.first_publish_year ? `${b.first_publish_year}` : undefined,
        pages: b.number_of_pages,
        coverUrl: `https://covers.openlibrary.org/b/id/${b.cover_edition_id}-M.jpg`,
      };
    }
  } catch { /* fall through to strategy B */ }

  // Strategy B: /search.json?isbn= (legacy param)
  try {
    const res = await fetch(`${BASE}/search.json?isbn=${encodeURIComponent(cleaned)}`);
    const data: any = await ok(res);
    if (data?.docs?.length > 0) {
      const b = data.docs[0];
      return {
        title: b.title,
        subtitle: undefined,
        authors: b.author_name?.slice(0, 3),
        publisher: b.publisher_name?.[0],
        publishDate: b.first_publish_year ? `${b.first_publish_year}` : undefined,
        pages: b.number_of_pages,
        coverUrl: `https://covers.openlibrary.org/b/id/${b.cover_edition_id}-M.jpg`,
      };
    }
  } catch { /* fall through to strategy C */ }

  // Strategy C: /isbn/XX.json (edition-level data)
  try {
    const res = await fetch(`${BASE}/isbn/${cleaned}.json`);
    const data: any = await ok(res);
    if (data && data.title) {
      return {
        title: data.title,
        subtitle: undefined, // edition-level usually doesn't have separate field
        authors: data.authors?.name ?? data.authors ?? [],
        publisher: data.publishers?.[0],
        publishDate: data.first_publish_date,
        pages: data.number_of_pages,
        coverUrl: `https://covers.openlibrary.org/b/id/${data.cover_edition_id}-M.jpg`,
      };
    }
  } catch { /* fall through */ }

  return null; // no results from any source
}

// ── ISBN search / browse (generic) ────────────────
async function searchWorks(query: string, opts?: { limit?: number}): Promise<any[] | null> {
  try {
    const params = new URLSearchParams();
    params.set('q', `isbn:${encodeURIComponent(query)}`);
    if (opts?.limit) params.set('limit', `${opts.limit}`);

    const res = await fetch(`${BASE}/search.json?${params.toString()}`);
    const data: any = await ok(res);
    return data?.docs ?? null;
  } catch { return null; }
}

// ── Work Search (Title / Author) ────────────────
/**
 * Search work metadata by title or title+author.
 * Returns `{ key, title, subtitle, authors, ISBN, coverUrl }` for each hit —
 * exactly what the manual-entry form needs to populate itself.
 */
async function searchWorksByTitle(
  query: string,
  opts?: { limit?: number; author?: string },
): Promise<{
  key: string;
  title: string;
  subtitle?: string;
  authors?: string[];
  ISBN?: string[];
  publisher?: string[];
  first_publish_year?: number | null;
  cover_edition_id?: number | null;
}[]> {
  const cleaned = query.replace(/[-\s]/g, '').trim();
  if (cleaned.length < 2) return [];

  // Build q-param: title:XYZ is best; add author_name:ABC if provided
  let qStr = `title:${encodeURIComponent(query)}`;
  if (opts?.author) qStr += ` AND author_name:"${encodeURIComponent(opts.author)}"`;

  try {
    const params = new URLSearchParams();
    params.set('q', qStr);
    params.set('limit', `${opts?.limit ?? 10}`);
    // Only return fields we care about (saves bandwidth)
    params.set(
      'fields',
      'key,title,subtitle,author_name,isbn,publisher_name,' +
        'first_publish_year,cover_edition_id,number_of_pages',
    );

    const res = await fetch(`${BASE}/search.json?${params.toString()}`);
    const data: any = await ok(res);
    if (!data?.docs) return [];

    return data.docs.map(
      (doc: any): {
        key: string;
        title: string;
        subtitle?: string;
        authors?: string[];
        ISBN?: string[];
        publisher?: string[];
        first_publish_year?: number | null;
        cover_edition_id?: number | null;
      } => ({
        key: doc.key,
        title: doc.title ?? '',
        subtitle: undefined, // not returned by search — fetch edition for that
        authors: doc.author_name?.slice(0, 3),
        ISBN: doc.isbn?.filter((i: string) =>
          i.replace(/[^0-9]/g, '').length === 10 ||
          i.replace(/[^0-9]/g, '').length === 13,
        ),
        publisher: doc.publisher_name ?? [],
        first_publish_year: doc.first_publish_year,
        cover_edition_id: doc.cover_edition_id,
      }),
    );
  } catch {
    return [];
  }
}

// ── ISBN validation / stripping ────────────────
function cleanIsbn(isbnRaw: string): string {
  return isbnRaw.replace(/[-\s]/g, '').trim();
}

export { fetchBookByIsbn, searchWorks, searchWorksByTitle, cleanIsbn };
