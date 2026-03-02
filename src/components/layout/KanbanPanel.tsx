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
const kanbanQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

// ---------------------------------------------------------------------------
// Bridge component — wraps children with Kanban WebSocket context.
// Retry capped at 2 so we don't spam the console if the backend drops.
// ---------------------------------------------------------------------------
function KanbanBridge({ children }: { children: React.ReactNode }) {
  const { isConnected, connectionState, reconnectAttempt } = useWebSocket({
    onOpen: { type: "subscribe:tasks" },
    maxReconnectAttempts: 2,
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

// ---------------------------------------------------------------------------
// KanbanPanel — public export
// ---------------------------------------------------------------------------
export function KanbanPanel() {
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
