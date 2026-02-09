import { NextRequest, NextResponse } from 'next/server';
import { getSessionMessages } from '@/lib/db/queries';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const messages = await getSessionMessages(id);
    if (messages.length === 0) {
      return NextResponse.json({ error: 'Session not found or has no messages' }, { status: 404 });
    }
    return NextResponse.json({ messages });
  } catch (err) {
    console.error('Session messages error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
