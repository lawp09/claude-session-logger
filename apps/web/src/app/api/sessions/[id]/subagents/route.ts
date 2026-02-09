import { NextRequest, NextResponse } from 'next/server';
import { getSessionSubagents } from '@/lib/db/queries';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const subagents = await getSessionSubagents(id);
    return NextResponse.json({ subagents });
  } catch (err) {
    console.error('Session subagents error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
