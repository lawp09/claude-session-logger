'use client';

import { useQuery } from '@tanstack/react-query';

export interface Session {
  id: string;
  projectSlug: string;
  projectPath: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  summary: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface ContentBlock {
  blockIndex: number;
  blockType: string;
  textContent: string | null;
  toolUseId: string | null;
  toolName: string | null;
  toolInput: Record<string, unknown> | null;
  toolResultContent: string | null;
  toolResultIsError: boolean;
}

export interface Message {
  id: string;
  type: string;
  role: string | null;
  model: string | null;
  timestamp: string;
  inputTokens: number | null;
  outputTokens: number | null;
  stopReason: string | null;
  isSidechain: boolean;
  subtype: string | null;
  durationMs: number | null;
  contentBlocks: ContentBlock[];
}

export interface SessionStats {
  totalMessages: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  durationMs: number | null;
  toolUsage: Record<string, number>;
}

export function useSessions(projectSlug?: string) {
  return useQuery<Session[]>({
    queryKey: ['sessions', projectSlug],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectSlug) params.set('project', projectSlug);
      const res = await fetch(`/api/sessions?${params}`);
      if (!res.ok) throw new Error('Failed to fetch sessions');
      return res.json();
    },
  });
}

export function useSessionMessages(sessionId: string | null) {
  return useQuery<Message[]>({
    queryKey: ['messages', sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${sessionId}/messages`);
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
    enabled: !!sessionId,
  });
}

export function useSessionStats(sessionId: string | null) {
  return useQuery<SessionStats>({
    queryKey: ['stats', sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${sessionId}/stats`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    enabled: !!sessionId,
  });
}
