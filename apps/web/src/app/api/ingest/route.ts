import { NextRequest, NextResponse } from 'next/server';
import { upsertSession, insertMessages } from '@/lib/db/queries';
import pool from '@/lib/db/pool';

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.CSL_INGEST_TOKEN;

  if (!expectedToken || !authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const payload = body as {
    session?: { sessionId?: string; projectPath?: string; projectSlug?: string; filePath?: string };
    messages?: unknown[];
    fileOffset?: number;
  };

  if (!payload.session?.sessionId || !payload.session?.projectPath || !payload.session?.projectSlug || !payload.session?.filePath) {
    return NextResponse.json({ error: 'Missing session fields' }, { status: 400 });
  }

  if (!Array.isArray(payload.messages)) {
    return NextResponse.json({ error: 'messages must be an array' }, { status: 400 });
  }

  try {
    await upsertSession({
      sessionId: payload.session.sessionId,
      projectPath: payload.session.projectPath,
      projectSlug: payload.session.projectSlug,
      filePath: payload.session.filePath,
      fileOffset: payload.fileOffset ?? 0,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await insertMessages(payload.messages as any[]);

    // Notify for real-time SSE
    await pool.query('SELECT pg_notify($1, $2)', ['new_messages', payload.session.sessionId]);

    return NextResponse.json({ ok: true, messagesIngested: payload.messages.length });
  } catch (err) {
    console.error('Ingest error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
