import * as React from 'react';
import {
  Inbox,
  Database,
  Zap,
  ArrowRightToLine,
  CircleDot,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useAtomValue, useSetAtom } from 'jotai';
import { sessionMetaMapAtom, type SessionMeta } from '@/atoms/sessions';
import { sourcesAtom } from '@/atoms/sources';
import { sendToWorkspaceAtom } from '@/atoms/sessions';
import { cn } from '@/lib/utils';
import { navigate, routes } from '@/lib/navigate';
import { useAppShellContext } from '@/context/AppShellContext';

/* ---------- atoms / helpers --------------------------------------------- */

function relativeTime(ms?: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const STATUS_DOT: Record<string, string> = {
  backlog: 'bg-muted-foreground/40',
  todo: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  done: 'bg-emerald-500',
  cancelled: 'bg-muted-foreground/20',
};

/* ---------- atoms ------------------------------------------------------- */

interface MetricProps {
  value: number | string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: 'neutral' | 'accent' | 'warn' | 'success';
  onClick?: () => void;
}

function Metric({ value, label, icon: Icon, tone = 'neutral', onClick }: MetricProps) {
  const toneClasses: Record<NonNullable<MetricProps['tone']>, string> = {
    neutral: 'text-foreground',
    accent: 'text-accent',
    warn: 'text-amber-500',
    success: 'text-emerald-500',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left',
        'bg-muted/30 border border-border/40',
        onClick && 'hover:bg-muted/60 hover:border-border cursor-pointer transition-colors',
      )}
    >
      {Icon && (
        <span className={cn('shrink-0', toneClasses[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className={cn('block text-lg leading-none font-semibold tabular-nums', toneClasses[tone])}>
          {value}
        </span>
        <span className="block text-[11px] text-muted-foreground mt-0.5 truncate">{label}</span>
      </span>
    </button>
  );
}

interface SessionRowProps {
  session: SessionMeta;
  onOpen: () => void;
  onTransfer?: () => void;
  workspaceLabel?: string;
}

function SessionRow({ session, onOpen, onTransfer, workspaceLabel }: SessionRowProps) {
  const dot = STATUS_DOT[session.sessionStatus || 'backlog'] || STATUS_DOT.backlog;
  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 rounded-md',
        'hover:bg-muted/40 transition-colors',
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dot)} aria-hidden />
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 flex items-baseline gap-2 text-left"
      >
        <span className="truncate text-sm">{session.name || 'Untitled session'}</span>
        {workspaceLabel && (
          <span className="text-[11px] text-muted-foreground/70 shrink-0">· {workspaceLabel}</span>
        )}
      </button>
      <span className="text-[11px] text-muted-foreground/60 shrink-0 tabular-nums">
        {relativeTime(session.lastMessageAt || session.createdAt)}
      </span>
      {onTransfer && (
        <button
          type="button"
          onClick={onTransfer}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          title="Send to another workspace"
        >
          <ArrowRightToLine className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ---------- OverviewPanel ----------------------------------------------- */

export function OverviewPanel() {
  const sessionMetas = useAtomValue(sessionMetaMapAtom);
  const sources = useAtomValue(sourcesAtom);
  const setSendToWorkspace = useSetAtom(sendToWorkspaceAtom);
  const { workspaces, activeWorkspaceId } = useAppShellContext();

  const workspaceNameById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const w of workspaces) m.set(w.id, w.name);
    return m;
  }, [workspaces]);

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);

  // Aggregate session stats across all workspaces
  const sessionStats = React.useMemo(() => {
    const metas = Array.from(sessionMetas.values());
    const total = metas.length;
    const byStatus: Record<string, number> = {
      backlog: 0, todo: 0, in_progress: 0, done: 0, cancelled: 0,
    };
    for (const meta of metas) {
      const status = meta.sessionStatus || 'backlog';
      byStatus[status] = (byStatus[status] || 0) + 1;
    }
    const byWorkspace = new Map<string, number>();
    for (const meta of metas) {
      const wid = meta.workspaceId || 'unknown';
      byWorkspace.set(wid, (byWorkspace.get(wid) || 0) + 1);
    }
    const flagged = metas.filter(m => m.isFlagged).length;
    return { total, byStatus, byWorkspace, flagged };
  }, [sessionMetas]);

  // Aggregate source stats
  const sourceStats = React.useMemo(() => {
    const all = sources || [];
    const connected = all.filter(s => s.config.connectionStatus === 'connected').length;
    const needsAuth = all.filter(s => s.config.connectionStatus === 'needs_auth').length;
    const failed = all.filter(s => s.config.connectionStatus === 'failed').length;
    return { total: all.length, connected, needsAuth, failed };
  }, [sources]);

  // Recent sessions across all workspaces
  const recentSessions = React.useMemo(() => {
    return Array.from(sessionMetas.values())
      .sort((a, b) =>
        (b.lastMessageAt || b.createdAt || 0) - (a.lastMessageAt || a.createdAt || 0)
      )
      .slice(0, 8);
  }, [sessionMetas]);

  const inProgress = React.useMemo(() => {
    return Array.from(sessionMetas.values())
      .filter(s => s.sessionStatus === 'in_progress')
      .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0))
      .slice(0, 5);
  }, [sessionMetas]);

  const handleNewSession = () => navigate(routes.action.newSession());
  const handleNewIssue = () => navigate(routes.view.issues());
  const handleAllSessions = () => navigate(routes.view.allSessions());
  const handleAllSources = () => navigate(routes.view.sources());
  const handleSession = (id: string) => navigate(routes.view.allSessions(id));

  const handleTransferSession = (sessionId: string) => {
    setSendToWorkspace([sessionId]);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-8 py-6 border-b border-border/40 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Across {workspaces.length} workspace{workspaces.length === 1 ? '' : 's'}
            {activeWorkspace && (
              <> · viewing as <span className="text-foreground/80">{activeWorkspace.name}</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleNewIssue}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-border/60 hover:bg-muted/60 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            New issue
          </button>
          <button
            type="button"
            onClick={handleNewSession}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New session
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-6 space-y-8">

          {/* SESSIONS row */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Sessions
              </h2>
              <button
                type="button"
                onClick={handleAllSessions}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                View all →
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Metric
                value={sessionStats.total}
                label="total"
                icon={Inbox}
                onClick={handleAllSessions}
              />
              <Metric
                value={sessionStats.byStatus.in_progress}
                label="in progress"
                icon={Clock}
                tone="warn"
              />
              <Metric
                value={sessionStats.byStatus.todo}
                label="todo"
                icon={CircleDot}
              />
              <Metric
                value={sessionStats.byStatus.done}
                label="done"
                icon={CheckCircle2}
                tone="success"
              />
              <Metric
                value={sessionStats.byStatus.backlog}
                label="backlog"
                icon={CircleDot}
              />
            </div>
          </section>

          {/* SOURCES + AUTOMATIONS row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Sources
                </h2>
                <button
                  type="button"
                  onClick={handleAllSources}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Manage →
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Metric
                  value={sourceStats.connected}
                  label="connected"
                  icon={Database}
                  tone="success"
                  onClick={handleAllSources}
                />
                <Metric
                  value={sourceStats.needsAuth}
                  label="needs auth"
                  icon={AlertTriangle}
                  tone="warn"
                  onClick={sourceStats.needsAuth > 0 ? handleAllSources : undefined}
                />
                <Metric
                  value={sourceStats.failed}
                  label="failed"
                  icon={AlertTriangle}
                  tone="warn"
                  onClick={sourceStats.failed > 0 ? handleAllSources : undefined}
                />
              </div>
            </section>

            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Automations
                </h2>
                <button
                  type="button"
                  onClick={() => navigate(routes.view.automations())}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Manage →
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Metric
                  value={2}
                  label="active"
                  icon={Zap}
                  tone="accent"
                  onClick={() => navigate(routes.view.automations())}
                />
                <Metric value={0} label="failed" icon={AlertTriangle} />
                <Metric value={0} label="paused" icon={Clock} />
              </div>
            </section>
          </div>

          {/* TWO-COLUMN: In-progress + Recent */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                In Progress
              </h2>
              {inProgress.length === 0 ? (
                <p className="text-sm text-muted-foreground/70 italic px-2">Nothing in flight.</p>
              ) : (
                <div className="space-y-0.5">
                  {inProgress.map(session => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      onOpen={() => handleSession(session.id)}
                      onTransfer={() => handleTransferSession(session.id)}
                      workspaceLabel={workspaceNameById.get(session.workspaceId || '')}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Recent
              </h2>
              {recentSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground/70 italic px-2">No sessions yet.</p>
              ) : (
                <div className="space-y-0.5">
                  {recentSessions.map(session => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      onOpen={() => handleSession(session.id)}
                      onTransfer={() => handleTransferSession(session.id)}
                      workspaceLabel={workspaceNameById.get(session.workspaceId || '')}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* WORKSPACE BREAKDOWN */}
          {workspaces.length > 1 && (
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                By Workspace
              </h2>
              <div className="space-y-1">
                {workspaces.map(w => {
                  const count = sessionStats.byWorkspace.get(w.id) || 0;
                  return (
                    <div
                      key={w.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/40 transition-colors"
                    >
                      <span className="flex-1 text-sm truncate">{w.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
                        {count} {count === 1 ? 'session' : 'sessions'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
