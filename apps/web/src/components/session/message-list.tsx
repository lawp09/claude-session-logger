'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useSessionMessages } from '@/lib/hooks/use-sessions';
import MessageBubble from './message-bubble';

interface MessageListProps {
  sessionId: string;
}

export default function MessageList({ sessionId }: MessageListProps) {
  const {
    data,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useSessionMessages(sessionId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);
  const prevScrollHeight = useRef(0);

  const messages = useMemo(() => {
    if (!data?.pages) return [];
    // Pages are loaded in reverse chronological order (oldest first per page)
    // Earlier pages = older messages, so we reverse the pages array
    const allPages = [...data.pages].reverse();
    return allPages.flatMap((page) => page.messages);
  }, [data]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (messages.length > 0 && isInitialLoad.current) {
      isInitialLoad.current = false;
      bottomRef.current?.scrollIntoView();
    }
  }, [messages]);

  // Reset initial load flag when session changes
  useEffect(() => {
    isInitialLoad.current = true;
  }, [sessionId]);

  // Maintain scroll position when loading older messages
  useEffect(() => {
    if (isFetchingNextPage) {
      prevScrollHeight.current = scrollRef.current?.scrollHeight ?? 0;
    }
  }, [isFetchingNextPage]);

  useEffect(() => {
    if (!isFetchingNextPage && prevScrollHeight.current > 0 && scrollRef.current) {
      const newHeight = scrollRef.current.scrollHeight;
      scrollRef.current.scrollTop = newHeight - prevScrollHeight.current;
      prevScrollHeight.current = 0;
    }
  }, [messages, isFetchingNextPage]);

  // IntersectionObserver for loading older messages when scrolling to top
  const handleTopIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(handleTopIntersect, {
      root: scrollRef.current,
      threshold: 0.1,
    });
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [handleTopIntersect]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-muted">Chargement des messages...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-red-400">Erreur: {error.message}</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-muted">Aucun message dans cette session</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-4">
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Top sentinel for loading older messages */}
        <div ref={topSentinelRef} className="h-1" />

        {isFetchingNextPage && (
          <div className="flex justify-center py-2">
            <Loader2 size={16} className="animate-spin text-text-muted" />
          </div>
        )}

        {hasNextPage && !isFetchingNextPage && (
          <div className="flex justify-center">
            <button
              onClick={() => fetchNextPage()}
              className="rounded-md px-3 py-1 text-xs text-text-secondary hover:bg-surface transition-colors"
            >
              Charger les messages precedents
            </button>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
