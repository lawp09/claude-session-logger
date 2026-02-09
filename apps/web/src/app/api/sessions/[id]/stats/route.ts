import { NextRequest, NextResponse } from 'next/server';
import { getSessionStats } from '@/lib/db/queries';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const stats = await getSessionStats(id);
    if (!stats) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    return NextResponse.json(stats);
  } catch (err) {
    console.error('Session stats error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
