import { useMemo } from "react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { KanbanBoard } from "@kanban/components/board/KanbanBoard";
import { useWebSocket } from "@kanban/hooks/useWebSocket";
import { WebSocketStatusProvider } from "@kanban/contexts/WebSocketContext";
import { LiveAnnouncerProvider } from "@kanban/components/shared/LiveAnnouncer";
import { KeyboardProvider } from "@kanban/hooks/useKeyboard";
import { BulkActionsProvider } from "@kanban/hooks/useBulkActions";
import { TaskConfigProvider } from "@kanban/contexts/TaskConfigContext";
import { ViewProvider } from "@kanban/contexts/ViewContext";

// ---------------------------------------------------------------------------
// Isolated QueryClient for the Kanban panel
// ---------------------------------------------------------------------------
// This keeps Kanban's React Query cache separate from Zuberi's own data so
// the two systems don't interfere with each other.
// ---------------------------------------------------------------------------
const kanbanQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

/**
 * Bridge component that sits inside QueryClientProvider so hooks like
 * useTaskSync (which needs useQueryClient) work correctly.
 */
function KanbanBridge({ children }: { children: React.ReactNode }) {
  const { isConnected, connectionState, reconnectAttempt } = useWebSocket({
    onOpen: { type: "subscribe:tasks" },
    maxReconnectAttempts: 20,
  });

  return (
    <WebSocketStatusProvider
      isConnected={isConnected}
      connectionState={connectionState}
      reconnectAttempt={reconnectAttempt}
    >
      {children}
    </WebSocketStatusProvider>
  );
}

/**
 * Self-contained Kanban panel that wraps KanbanBoard with every provider
 * it needs. Intended to be rendered inside PanelLayout's right slot.
 */
export function KanbanPanel() {
  // Stable reference so <QueryClientProvider> doesn't re-mount
  const client = useMemo(() => kanbanQueryClient, []);

  return (
    <div className="kanban-panel dark h-full overflow-auto bg-background text-foreground">
      <QueryClientProvider client={client}>
        <KanbanBridge>
          <LiveAnnouncerProvider>
            <KeyboardProvider>
              <BulkActionsProvider>
                <TaskConfigProvider>
                  <ViewProvider>
                    <div className="h-full px-4 py-3">
                      <KanbanBoard />
                    </div>
                  </ViewProvider>
                </TaskConfigProvider>
              </BulkActionsProvider>
            </KeyboardProvider>
          </LiveAnnouncerProvider>
        </KanbanBridge>
      </QueryClientProvider>
    </div>
  );
}
