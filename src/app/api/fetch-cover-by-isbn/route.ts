import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { isbn } = await request.json();

    if (!isbn || isbn.replace(/[-\s]/g, '').length < 3) {
      return NextResponse.json({ error: 'Missing or invalid ISBN' }, { status: 400 });
    }

    const cleaned = isbn.replace(/[-\s]/g, '');

    // Strategy A: Try OpenLibrary covers endpoint for ISBN
    // This may return 302 for some ISBNs — we follow redirects automatically
    try {
      const coversRes = await fetch(
        `https://covers.openlibrary.org/b/isbn/${cleaned}.json`,
        { headers: { 'User-Agent': 'Librarium/1.0' } },
      );

      if (coversRes.ok) {
        const coverData = await coversRes.json();
        if (coverData?.id) {
          // The covers ISBN endpoint returns {"id": ..., ...} not {"cover_id": ..., ...}
          const coverId = coverData.id;
          // Try b/id first (preferred), then c/id as fallback
          const imageUrl = `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
          const imgRes = await fetch(imageUrl, {
            headers: { 'User-Agent': 'Librarium/1.0' },
          });
          if (imgRes.ok) {
            const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
            const buffer = await imgRes.arrayBuffer();
            return NextResponse.json({
              bytes: Array.from(new Uint8Array(buffer)),
              contentType,
              size: new Uint8Array(buffer).length,
            });
          }
        }
      }
    } catch {
      // Fall through to strategy B
    }

    // Strategy B: Search by ISBN to find cover_i or cover_edition_id
    try {
      const searchRes = await fetch(
        `https://openlibrary.org/search.json?q=isbn:${cleaned}&limit=3`,
        { headers: { 'User-Agent': 'Librarium/1.0' } },
      );

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const doc = searchData?.docs?.[0];

        // Prefer cover_edition_id (larger covers), fall back to cover_i
        if (doc?.cover_edition_id) {
          const imageUrl = `https://covers.openlibrary.org/b/id/${doc.cover_edition_id}-M.jpg`;
          const imgRes = await fetch(imageUrl, {
            headers: { 'User-Agent': 'Librarium/1.0' },
          });
          if (imgRes.ok) {
            const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
            const buffer = await imgRes.arrayBuffer();
            return NextResponse.json({
              bytes: Array.from(new Uint8Array(buffer)),
              contentType,
              size: new Uint8Array(buffer).length,
            });
          }
        } else if (doc?.cover_i) {
          // cover_i uses a different URL pattern
          const coverId = doc.cover_i;
          const imageUrl = `https://covers.openlibrary.org/c/id/${coverId}-M.jpg`;
          const imgRes = await fetch(imageUrl, {
            headers: { 'User-Agent': 'Librarium/1.0' },
          });
          if (imgRes.ok) {
            const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
            const buffer = await imgRes.arrayBuffer();
            return NextResponse.json({
              bytes: Array.from(new Uint8Array(buffer)),
              contentType,
              size: new Uint8Array(buffer).length,
            });
          }
        }
      }
    } catch {
      // Fall through to final fallback
    }

    // Strategy C: Try to derive cover_edition_id from cover_i
    // Sometimes cover_i is valid with /b/id/ URL too
    try {
      const searchRes = await fetch(
        `https://openlibrary.org/search.json?q=isbn:${cleaned}&limit=1`,
        { headers: { 'User-Agent': 'Librarium/1.0' } },
      );

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const doc = searchData?.docs?.[0];
        if (doc?.cover_i && !doc?.cover_edition_id) {
          const imageUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`;
          const imgRes = await fetch(imageUrl, {
            headers: { 'User-Agent': 'Librarium/1.0' },
          });
          if (imgRes.ok) {
            const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
            const buffer = await imgRes.arrayBuffer();
            return NextResponse.json({
              bytes: Array.from(new Uint8Array(buffer)),
              contentType,
              size: new Uint8Array(buffer).length,
            });
          }
        }
      }
    } catch {
      // Final fallback failed
    }

    return NextResponse.json({ error: 'No cover found for this ISBN' }, { status: 404 });
  } catch (err: any) {
    console.error('Fetch cover by ISBN error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch cover' },
      { status: 500 },
    );
  }
}
