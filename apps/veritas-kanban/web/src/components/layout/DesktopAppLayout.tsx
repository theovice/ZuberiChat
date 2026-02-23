import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, FolderKanban, MessageSquarePlus, Search } from 'lucide-react';
import { KanbanBoard } from '@/components/board/KanbanBoard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClawdChatInterface } from '@/components/chat/ClawdChatInterface';

type DesktopAppLayoutProps = {
  children?: ReactNode;
};

const chats = ['Product planning sync', 'Backlog cleanup', 'Sprint review notes'];
const projects = ['wholesaling-pipeline'];
const artifacts = ['Deal analyzer prompt', 'Sales call transcript'];

export function DesktopAppLayout({ children }: DesktopAppLayoutProps) {
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className="titlebar-drag flex h-10 items-center justify-between border-b border-border bg-card px-3">
        <p className="text-sm font-medium">Veritas Chat</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="titlebar-no-drag"
          onClick={() => setIsRightPanelOpen((open) => !open)}
          aria-label={isRightPanelOpen ? 'Collapse AI Kanban panel' : 'Expand AI Kanban panel'}
        >
          {isRightPanelOpen ? (
            <ChevronRight className="mr-1 h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
          )}
          {isRightPanelOpen ? 'Hide board' : 'Show board'}
        </Button>
      </div>

      <div className="flex h-[calc(100vh-40px)]">
        <aside className="w-[260px] border-r border-border bg-card p-4">
          <div className="space-y-4">
            <Button className="w-full justify-start" variant="secondary" type="button">
              <MessageSquarePlus className="mr-2 h-4 w-4" aria-hidden="true" />
              New chat
            </Button>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search" aria-label="Search chats and projects" />
            </div>

            <nav className="space-y-5" aria-label="Desktop app navigation">
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Chats
                </h2>
                <ul className="space-y-1">
                  {chats.map((chat) => (
                    <li key={chat}>
                      <button
                        type="button"
                        className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        {chat}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Projects
                </h2>
                <ul className="space-y-1">
                  {projects.map((project) => (
                    <li key={project}>
                      <button
                        type="button"
                        className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <FolderKanban className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        {project}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Artifacts
                </h2>
                <ul className="space-y-1">
                  {artifacts.map((artifact) => (
                    <li key={artifact}>
                      <button
                        type="button"
                        className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        {artifact}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </nav>
          </div>
        </aside>

        <main className="flex-1 overflow-auto bg-background">{children ?? <ClawdChatInterface />}</main>

        {isRightPanelOpen && (
          <aside className="w-[400px] border-l border-border bg-card">
            <div className="h-full overflow-auto p-3">
              <KanbanBoard />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
