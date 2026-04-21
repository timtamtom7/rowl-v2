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
  Lightbulb,
  Activity,
  Folder,
} from 'lucide-react';
import { useAtomValue, useSetAtom } from 'jotai';
import { sessionMetaMapAtom, type SessionMeta } from '@/atoms/sessions';
import { sourcesAtom } from '@/atoms/sources';
import { sendToWorkspaceAtom } from '@/atoms/sessions';
import { cn } from '@/lib/utils';
import { navigate, routes } from '@/lib/navigate';
import { useAppShellContext } from '@/context/AppShellContext';
import { useIssues } from '@/hooks/useIssues';

/* ---------- helpers ----------------------------------------------------- */

function relativeTime(ms?: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  return `${w}w`;
}

const STATUS_DOT: Record<string, string> = {
  backlog: 'bg-muted-foreground/40',
  todo: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  done: 'bg-emerald-500',
  cancelled: 'bg-muted-foreground/20',
};

/* ---------- Metric tile ------------------------------------------------- */

interface MetricProps {
  value: number | string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: 'neutral' | 'accent' | 'warn' | 'success';
  onClick?: () => void;
}

function Metric({ value, label, icon: Icon, tone = 'neutral', onClick }: MetricProps) {
  const toneFG: Record<NonNullable<MetricProps['tone']>, string> = {
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
        'group flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left',
        'bg-muted/30 border border-border/40',
        onClick && 'hover:bg-muted/60 hover:border-border cursor-pointer transition-colors',
      )}
    >
      {Icon && (
        <span className={cn('shrink-0', toneFG[tone])}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className={cn('block text-base leading-none font-semibold tabular-nums', toneFG[tone])}>
          {value}
        </span>
        <span className="block text-[10.5px] text-muted-foreground mt-1 truncate">{label}</span>
      </span>
    </button>
  );
}

/* ---------- Session row ------------------------------------------------- */

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
        <span className="truncate text-[13px]">{session.name || 'Untitled session'}</span>
        {workspaceLabel && (
          <span className="text-[10.5px] text-muted-foreground/70 shrink-0">· {workspaceLabel}</span>
        )}
      </button>
      <span className="text-[10.5px] text-muted-foreground/60 shrink-0 tabular-nums">
        {relativeTime(session.lastMessageAt || session.createdAt)}
      </span>
      {onTransfer && (
        <button
          type="button"
          onClick={onTransfer}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          title="Send to another workspace"
        >
          <ArrowRightToLine className="h-3 w-3" />
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
  const { issues } = useIssues();

  const workspaceNameById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const w of workspaces) m.set(w.id, w.name);
    return m;
  }, [workspaces]);

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);

  // Sessions
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

  // Sources
  const sourceStats = React.useMemo(() => {
    const all = sources || [];
    const connected = all.filter(s => s.config.connectionStatus === 'connected').length;
    const needsAuth = all.filter(s => s.config.connectionStatus === 'needs_auth').length;
    const failed = all.filter(s => s.config.connectionStatus === 'failed').length;
    return { total: all.length, connected, needsAuth, failed };
  }, [sources]);

  // Issues
  const issueStats = React.useMemo(() => {
    const open = issues.filter(i => i.status !== 'done').length;
    const inProgress = issues.filter(i => i.status === 'in_progress').length;
    return { total: issues.length, open, inProgress };
  }, [issues]);

  // Recent sessions across all workspaces
  const recentSessions = React.useMemo(() => {
    return Array.from(sessionMetas.values())
      .sort(
        (a, b) =>
          (b.lastMessageAt || b.createdAt || 0) - (a.lastMessageAt || a.createdAt || 0)
      )
      .slice(0, 6);
  }, [sessionMetas]);

  const inProgressSessions = React.useMemo(() => {
    return Array.from(sessionMetas.values())
      .filter(s => s.sessionStatus === 'in_progress')
      .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0))
      .slice(0, 6);
  }, [sessionMetas]);

  const handleNewSession = () => navigate(routes.action.newSession());
  const handleNewIssue = () => navigate(routes.view.issues());
  const handleAllSessions = () => navigate(routes.view.allSessions());
  const handleAllSources = () => navigate(routes.view.sources());
  const handleAllIssues = () => navigate(routes.view.issues());
  const handleAutomations = () => navigate(routes.view.automations());
  const handleSession = (id: string) => navigate(routes.view.allSessions(id));
  const handleTransferSession = (sessionId: string) => setSendToWorkspace([sessionId]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <Activity className="h-4 w-4 text-accent" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight">Overview</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {workspaces.length} workspace{workspaces.length === 1 ? '' : 's'}
              {activeWorkspace && (
                <> · viewing as <span className="text-foreground/80">{activeWorkspace.name}</span></>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleNewIssue}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-border/60 hover:bg-muted/60 transition-colors"
          >
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
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
        <div className="px-6 py-5 space-y-5 max-w-[960px]">
          {/* SUMMARY ROW — 4 metrics across the top */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Metric
              value={sessionStats.total}
              label="sessions"
              icon={Inbox}
              onClick={handleAllSessions}
            />
            <Metric
              value={sourceStats.connected}
              label="sources connected"
              icon={Database}
              tone="success"
              onClick={handleAllSources}
            />
            <Metric
              value={issueStats.open}
              label="open issues"
              icon={Lightbulb}
              tone="warn"
              onClick={handleAllIssues}
            />
            <Metric
              value={sessionStats.byStatus.in_progress}
              label="in progress"
              icon={Clock}
              tone="accent"
            />
          </section>

          {/* SESSIONS BREAKDOWN */}
          <section>
            <SectionHeader title="Sessions by status" onAction={handleAllSessions} actionLabel="View all" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric value={sessionStats.byStatus.todo} label="todo" icon={CircleDot} />
              <Metric value={sessionStats.byStatus.in_progress} label="in progress" icon={Clock} tone="warn" />
              <Metric value={sessionStats.byStatus.done} label="done" icon={CheckCircle2} tone="success" />
              <Metric value={sessionStats.byStatus.backlog} label="backlog" icon={CircleDot} />
            </div>
          </section>

          {/* SOURCES + AUTOMATIONS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <section>
              <SectionHeader title="Sources" onAction={handleAllSources} actionLabel="Manage" />
              <div className="grid grid-cols-3 gap-2">
                <Metric
                  value={sourceStats.connected}
                  label="connected"
                  icon={Database}
                  tone="success"
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
              <SectionHeader title="Automations" onAction={handleAutomations} actionLabel="Manage" />
              <div className="grid grid-cols-3 gap-2">
                <Metric value={2} label="active" icon={Zap} tone="accent" onClick={handleAutomations} />
                <Metric value={0} label="failed" icon={AlertTriangle} />
                <Metric value={0} label="paused" icon={Clock} />
              </div>
            </section>
          </div>

          {/* IN PROGRESS + RECENT */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <section>
              <SectionHeader
                title="In progress"
                badge={inProgressSessions.length || undefined}
              />
              {inProgressSessions.length === 0 ? (
                <div className="text-[13px] text-muted-foreground/70 italic px-2 py-4">
                  Nothing in flight.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {inProgressSessions.map(session => (
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
              <SectionHeader title="Recent" />
              {recentSessions.length === 0 ? (
                <div className="text-[13px] text-muted-foreground/70 italic px-2 py-4">
                  No sessions yet — start one above.
                </div>
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

          {/* WORKSPACE BREAKDOWN — only when more than one */}
          {workspaces.length > 1 && (
            <section>
              <SectionHeader title="By workspace" />
              <div className="rounded-lg border border-border/40 divide-y divide-border/30">
                {workspaces.map(w => {
                  const count = sessionStats.byWorkspace.get(w.id) || 0;
                  const pct = sessionStats.total > 0 ? Math.round((count / sessionStats.total) * 100) : 0;
                  return (
                    <div
                      key={w.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors"
                    >
                      <Folder className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                      <span className="flex-1 text-[13px] truncate">{w.name}</span>
                      <div className="hidden sm:block w-24 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className="h-full bg-accent/60"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground tabular-nums w-16 text-right shrink-0">
                        {count} session{count === 1 ? '' : 's'}
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

/* ---------- Section header ---------------------------------------------- */

interface SectionHeaderProps {
  title: string;
  badge?: number;
  onAction?: () => void;
  actionLabel?: string;
}

function SectionHeader({ title, badge, onAction, actionLabel }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        {title}
        {badge !== undefined && badge > 0 && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted/60 text-muted-foreground tabular-nums">
            {badge}
          </span>
        )}
      </h2>
      {onAction && actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {actionLabel} →
        </button>
      )}
    </div>
  );
}
