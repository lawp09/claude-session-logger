import { NextRequest, NextResponse } from 'next/server';
import { getSessionMessages } from '@/lib/db/queries';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const cursor = searchParams.get('cursor') || undefined;

  try {
    const result = await getSessionMessages({ sessionId: id, limit, cursor });
    if (result.total === 0) {
      return NextResponse.json({ error: 'Session not found or has no messages' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('Session messages error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
