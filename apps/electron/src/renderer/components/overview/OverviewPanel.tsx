import * as React from 'react';
import { Home, Inbox, Database, Zap, Clock, ChevronRight, ArrowRightToLine } from 'lucide-react';
import { useAtomValue, useSetAtom } from 'jotai';
import { sessionMetaMapAtom, type SessionMeta } from '@/atoms/sessions';
import { sourcesAtom } from '@/atoms/sources';
import { sendToWorkspaceAtom } from '@/atoms/sessions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { navigate, routes } from '@/lib/navigate';

interface StatCardProps {
  value: number;
  label: string;
  onClick?: () => void;
  variant?: 'default' | 'accent' | 'warning' | 'success';
}

function StatCard({ value, label, onClick, variant = 'default' }: StatCardProps) {
  const variantStyles = {
    default: 'bg-muted/50 text-foreground',
    accent: 'bg-accent/10 text-accent',
    warning: 'bg-warning/10 text-warning',
    success: 'bg-success/10 text-success',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex flex-col items-center justify-center p-4 rounded-xl min-w-[80px]',
        'transition-colors duration-150',
        onClick ? 'hover:bg-muted cursor-pointer' : 'cursor-default',
        variantStyles[variant],
      )}
    >
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground mt-1">{label}</span>
    </button>
  );
}

interface SessionRowProps {
  session: SessionMeta;
  onClick: () => void;
  onTransfer?: () => void;
}

function SessionRow({ session, onClick, onTransfer }: SessionRowProps) {
  const statusColors: Record<string, string> = {
    backlog: 'bg-muted-foreground/30',
    todo: 'bg-blue-500',
    in_progress: 'bg-green-500',
    done: 'bg-success',
    cancelled: 'bg-muted-foreground/30',
  };

  const statusColor = statusColors[session.sessionStatus || 'backlog'];

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 rounded-lg',
        'hover:bg-muted/50 transition-colors',
      )}
    >
      {/* Status indicator */}
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-2 flex-1 min-w-0"
      >
        <span className={cn('w-2 h-2 rounded-full shrink-0', statusColor)} />
        <span className="flex-1 truncate text-sm">{session.name || 'Untitled'}</span>
      </button>

      {/* Transfer button */}
      {onTransfer && (
        <button
          type="button"
          onClick={onTransfer}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
          title="Send to workspace"
        >
          <ArrowRightToLine className="h-4 w-4" />
        </button>
      )}

      {/* Navigate */}
      <button
        type="button"
        onClick={onClick}
        className="p-1 rounded hover:bg-muted text-muted-foreground"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function OverviewPanel() {
  const sessionMetas = useAtomValue(sessionMetaMapAtom);
  const sources = useAtomValue(sourcesAtom);
  const setSendToWorkspace = useSetAtom(sendToWorkspaceAtom);

  // Aggregate session stats
  const sessions = React.useMemo(() => {
    const metas = Array.from(sessionMetas.values());
    const total = metas.length;
    const byStatus: Record<string, number> = {};
    for (const meta of metas) {
      const status = meta.sessionStatus || 'backlog';
      byStatus[status] = (byStatus[status] || 0) + 1;
    }
    return { total, byStatus };
  }, [sessionMetas]);

  // Aggregate source stats
  const sourceStats = React.useMemo(() => {
    const all = sources || [];
    const connected = all.filter(s => s.config.connectionStatus === 'connected').length;
    const needsAuth = all.filter(s => s.config.connectionStatus === 'needs_auth').length;
    const failed = all.filter(s => s.config.connectionStatus === 'failed').length;
    return { total: all.length, connected, needsAuth, failed };
  }, [sources]);

  // Get recent sessions (last 5)
  const recentSessions = React.useMemo(() => {
    return Array.from(sessionMetas.values())
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 5);
  }, [sessionMetas]);

  const handleAllSessions = () => navigate(routes.view.allSessions());
  const handleAllSources = () => navigate(routes.view.sources());
  const handleAllAutomations = () => navigate(routes.view.automations());
  const handleAllViews = () => navigate(routes.view.allSessions());
  const handleSessionClick = (sessionId: string) => navigate(routes.view.allSessions(sessionId));

  // Handle transfer to workspace
  const handleTransferSession = (sessionId: string) => {
    setSendToWorkspace([sessionId]);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border/50">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent/10">
          <Home className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Overview</h1>
          <p className="text-xs text-muted-foreground">Everything at a glance</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Sessions Section */}
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Sessions
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              value={sessions.total}
              label="total"
              onClick={handleAllSessions}
              variant="default"
            />
            <StatCard
              value={sessions.byStatus['in_progress'] || 0}
              label="active"
              variant="accent"
            />
            <StatCard
              value={sessions.byStatus['todo'] || 0}
              label="todo"
              variant="default"
            />
            <StatCard
              value={sessions.byStatus['done'] || 0}
              label="done"
              variant="success"
            />
          </div>
        </section>

        {/* Sources Section */}
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Sources
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              value={sourceStats.connected}
              label="connected"
              variant="success"
              onClick={handleAllSources}
            />
            <StatCard
              value={sourceStats.needsAuth}
              label="needs auth"
              variant="warning"
            />
            <StatCard
              value={sourceStats.failed}
              label="failed"
              variant="accent"
            />
          </div>
        </section>

        {/* Automations Section */}
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Automations
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              value={2}
              label="active"
              variant="accent"
              onClick={handleAllAutomations}
            />
            <StatCard
              value={0}
              label="failed"
              variant="warning"
            />
          </div>
        </section>

        {/* Quick Actions */}
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Quick Actions
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleAllSessions}>
              <Inbox className="h-4 w-4 mr-2" />
              All Sessions
            </Button>
            <Button variant="outline" size="sm" onClick={handleAllSources}>
              <Database className="h-4 w-4 mr-2" />
              All Sources
            </Button>
            <Button variant="outline" size="sm" onClick={handleAllAutomations}>
              <Zap className="h-4 w-4 mr-2" />
              Automations
            </Button>
            <Button variant="outline" size="sm" onClick={handleAllViews}>
              <Inbox className="h-4 w-4 mr-2" />
              Views
            </Button>
          </div>
        </section>

        {/* Recent Sessions */}
        {recentSessions.length > 0 && (
          <section>
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Recent Sessions
            </h2>
            <div className="space-y-1">
              {recentSessions.map(session => (
                <SessionRow
                  key={session.id}
                  session={session}
                  onClick={() => handleSessionClick(session.id)}
                  onTransfer={() => handleTransferSession(session.id)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
