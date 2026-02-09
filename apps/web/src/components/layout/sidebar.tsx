'use client';

import { useState, useMemo } from 'react';
import { Search, MessageSquare, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useSessions, type Session } from '@/lib/hooks/use-sessions';
import ThemeToggle from './theme-toggle';

interface SidebarProps {
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
}

export default function Sidebar({ selectedSessionId, onSelectSession }: SidebarProps) {
  const { data: sessions, isLoading } = useSessions();
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => {
    if (!sessions) return {};
    const filtered = sessions.filter((s) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        s.projectSlug.toLowerCase().includes(q) ||
        (s.summary?.toLowerCase().includes(q) ?? false)
      );
    });
    return filtered.reduce<Record<string, Session[]>>((acc, session) => {
      const key = session.projectSlug;
      if (!acc[key]) acc[key] = [];
      acc[key].push(session);
      return acc;
    }, {});
  }, [sessions, search]);

  return (
    <aside className="flex h-screen w-[260px] flex-col border-r border-border bg-sidebar">
      <div className="flex items-center justify-between border-b border-border px-3 py-3">
        <h2 className="text-sm font-semibold text-text-primary">Sessions</h2>
        <ThemeToggle />
      </div>

      <div className="px-3 py-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1">
        {isLoading && (
          <p className="px-2 py-4 text-center text-sm text-text-muted">Chargement...</p>
        )}

        {!isLoading && Object.keys(grouped).length === 0 && (
          <p className="px-2 py-4 text-center text-sm text-text-muted">Aucune session</p>
        )}

        {Object.entries(grouped).map(([slug, items]) => (
          <div key={slug} className="mb-3">
            <p className="mb-1 px-2 text-xs font-medium uppercase tracking-wider text-text-muted">
              {slug}
            </p>
            {items.map((session) => (
              <button
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={`mb-0.5 flex w-full flex-col rounded-md px-2 py-2 text-left transition-colors ${
                  selectedSessionId === session.id
                    ? 'bg-surface text-text-primary'
                    : 'text-text-secondary hover:bg-surface/50'
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm">
                  <MessageSquare size={13} className="shrink-0" />
                  <span className="truncate">
                    {session.summary || `Session ${new Date(session.startedAt).toLocaleDateString('fr-CA')}`}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {formatDistanceToNow(new Date(session.startedAt), { addSuffix: true, locale: fr })}
                  </span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      session.status === 'active'
                        ? 'bg-accent/20 text-accent'
                        : 'bg-surface text-text-muted'
                    }`}
                  >
                    {session.status === 'active' ? 'actif' : 'termine'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
