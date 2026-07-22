import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { url, bookId } = await request.json();
    const urlParams = new URL(request.url).searchParams;
    const imageUrl = url || urlParams.get('url');

    if (!imageUrl) {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    }

    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Librarium/1.0' },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: ${res.status}` },
        { status: res.status }
      );
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    return NextResponse.json({
      bytes: Array.from(bytes),
      contentType,
      size: bytes.length,
    });
  } catch (err: any) {
    console.error('Fetch cover error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch image' },
      { status: 500 }
    );
  }
}
