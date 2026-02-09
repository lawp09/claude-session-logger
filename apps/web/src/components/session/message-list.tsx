'use client';

import { useEffect, useRef } from 'react';
import { useSessionMessages } from '@/lib/hooks/use-sessions';
import MessageBubble from './message-bubble';

interface MessageListProps {
  sessionId: string;
}

export default function MessageList({ sessionId }: MessageListProps) {
  const { data: messages, isLoading, error } = useSessionMessages(sessionId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  if (!messages || messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-muted">Aucun message dans cette session</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto max-w-3xl space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
