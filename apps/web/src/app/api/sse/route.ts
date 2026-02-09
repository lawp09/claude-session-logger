import { Client } from 'pg';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      let alive = true;

      const cleanup = async () => {
        if (!alive) return;
        alive = false;
        try {
          await client.query('UNLISTEN new_messages');
          await client.end();
        } catch {
          // ignore cleanup errors
        }
      };

      try {
        await client.connect();
        await client.query('LISTEN new_messages');

        // Send initial keepalive
        controller.enqueue(encoder.encode(': connected\n\n'));

        client.on('notification', (msg) => {
          if (!alive) return;
          try {
            const data = JSON.stringify({ sessionId: msg.payload, type: 'new_messages' });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } catch {
            // ignore encoding errors
          }
        });

        client.on('error', () => {
          cleanup();
          try { controller.close(); } catch { /* already closed */ }
        });

        // Keepalive every 30s
        const interval = setInterval(() => {
          if (!alive) {
            clearInterval(interval);
            return;
          }
          try {
            controller.enqueue(encoder.encode(': keepalive\n\n'));
          } catch {
            clearInterval(interval);
            cleanup();
          }
        }, 30_000);
      } catch (err) {
        console.error('SSE connection error:', err);
        await cleanup();
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
