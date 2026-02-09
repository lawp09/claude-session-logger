'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useSSE() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const eventSource = new EventSource('/api/sse');

    eventSource.addEventListener('new_messages', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.sessionId) {
          queryClient.invalidateQueries({ queryKey: ['messages', data.sessionId] });
          queryClient.invalidateQueries({ queryKey: ['stats', data.sessionId] });
        }
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      } catch {
        // ignore parse errors
      }
    });

    eventSource.addEventListener('session_update', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.sessionId) {
          queryClient.invalidateQueries({ queryKey: ['messages', data.sessionId] });
          queryClient.invalidateQueries({ queryKey: ['stats', data.sessionId] });
        }
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      } catch {
        // ignore parse errors
      }
    });

    return () => {
      eventSource.close();
    };
  }, [queryClient]);
}
