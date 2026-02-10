'use client';

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';

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
  messageCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  toolUseCount: number;
  thinkingCount: number;
  durationMs: number | null;
  topTools: { name: string; count: number }[];
}

export function useSessions(projectSlug?: string) {
  return useQuery<Session[]>({
    queryKey: ['sessions', projectSlug],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectSlug) params.set('project', projectSlug);
      const res = await fetch(`/api/sessions?${params}`);
      if (!res.ok) throw new Error('Failed to fetch sessions');
      const data = await res.json();
      return data.sessions;
    },
  });
}

interface PaginatedMessagesResponse {
  messages: Message[];
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
}

export function useSessionMessages(sessionId: string | null) {
  return useInfiniteQuery<PaginatedMessagesResponse>({
    queryKey: ['messages', sessionId],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (pageParam) params.set('cursor', pageParam as string);
      const res = await fetch(`/api/sessions/${sessionId}/messages?${params}`);
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!sessionId,
  });
}

export interface Subagent {
  id: string;
  sessionId: string;
  agentType: string | null;
  prompt: string | null;
  status: string;
  totalDurationMs: number | null;
  totalTokens: number | null;
  totalToolUseCount: number | null;
  startedAt: string | null;
  endedAt: string | null;
}

export function useSessionSubagents(sessionId: string | null) {
  return useQuery<Subagent[]>({
    queryKey: ['subagents', sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${sessionId}/subagents`);
      if (!res.ok) throw new Error('Failed to fetch subagents');
      const data = await res.json();
      return data.subagents;
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
