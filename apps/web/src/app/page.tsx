'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { MessageSquare, Menu, X } from 'lucide-react';
import Sidebar from '@/components/layout/sidebar';
import MessageList from '@/components/session/message-list';
import { useSSE } from '@/lib/hooks/use-sse';

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('session');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useSSE();

  const handleSelectSession = (id: string) => {
    router.push(`/?session=${id}`);
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile toggle */}
      <button
        className="fixed left-3 top-3 z-50 rounded-md bg-surface p-2 text-text-secondary md:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-40 transform transition-transform md:relative md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar selectedSessionId={sessionId} onSelectSession={handleSelectSession} />
      </div>

      {/* Overlay on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {sessionId ? (
          <MessageList sessionId={sessionId} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <MessageSquare size={48} className="text-text-muted" />
            <h1 className="text-xl font-semibold text-text-primary">Claude Session Logger</h1>
            <p className="text-text-secondary">
              Selectionnez une session pour voir les messages
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
