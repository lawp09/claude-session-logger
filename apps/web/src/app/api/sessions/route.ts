import { NextRequest, NextResponse } from 'next/server';
import { getSessions } from '@/lib/db/queries';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectSlug = searchParams.get('project') ?? undefined;
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10) || 0, 0);

  try {
    const result = await getSessions({ projectSlug, limit, offset });
    return NextResponse.json({ ...result, limit, offset });
  } catch (err) {
    console.error('Sessions list error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
