import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { isbn } = await request.json();

    if (!isbn || isbn.replace(/[-\s]/g, '').length < 3) {
      return NextResponse.json({ error: 'Missing or invalid ISBN' }, { status: 400 });
    }

    const cleaned = isbn.replace(/[-\s]/g, '');

    // First try: OpenLibrary covers endpoint for ISBN
    const coversRes = await fetch(
      `https://covers.openlibrary.org/b/isbn/${cleaned}.json`,
      { headers: { 'User-Agent': 'Librarium/1.0' } },
    );

    if (coversRes.ok) {
      const coverData = await coversRes.json();
      if (coverData?.cover_id) {
        const imageUrl = `https://covers.openlibrary.org/b/id/${coverData.cover_id}-M.jpg`;
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

    // Fallback: try /search.json?q=isbn:XX for cover_edition_id
    const searchRes = await fetch(
      `https://openlibrary.org/search.json?q=isbn:${cleaned}&limit=3`,
      { headers: { 'User-Agent': 'Librarium/1.0' } },
    );

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const doc = searchData?.docs?.[0];
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
      }
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
