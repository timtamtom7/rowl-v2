import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export class GitCommandError extends Error {
  constructor(
    public readonly command: string,
    public readonly args: string[],
    public readonly stderr: string,
    public readonly cause?: unknown,
  ) {
    super(`git ${[command, ...args].join(' ')} failed: ${stderr.trim()}`);
    this.name = 'GitCommandError';
  }
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    return stdout.toString();
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: Buffer | string };
    const stderr = typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString() ?? e.message ?? '';
    throw new GitCommandError(args[0] ?? '', args.slice(1), stderr, err);
  }
}

export async function listBranches(cwd: string): Promise<string[]> {
  const out = await runGit(cwd, ['branch', '--format=%(refname:short)']);
  return out.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
}

export interface CheckoutOptions {
  create?: boolean;
  from?: string; // base branch or SHA when creating
}

export async function checkoutBranch(cwd: string, branch: string, opts: CheckoutOptions = {}): Promise<void> {
  const args = ['checkout'];
  if (opts.create) args.push('-b');
  args.push(branch);
  if (opts.create && opts.from) args.push(opts.from);
  await runGit(cwd, args);
}

export interface WorktreeAddOptions {
  branch: string;
  path: string;
  /** When true, creates the branch as part of `git worktree add -b`. */
  createBranch?: boolean;
  /** Base branch/SHA for new branches. Defaults to HEAD. */
  from?: string;
}

export async function worktreeAdd(cwd: string, opts: WorktreeAddOptions): Promise<void> {
  const args = ['worktree', 'add'];
  if (opts.createBranch) args.push('-b', opts.branch);
  args.push(opts.path);
  if (opts.createBranch && opts.from) args.push(opts.from);
  else if (!opts.createBranch) args.push(opts.branch);
  await runGit(cwd, args);
}

export async function worktreeRemove(cwd: string, worktreePath: string): Promise<void> {
  await runGit(cwd, ['worktree', 'remove', worktreePath]);
}

export async function statusPorcelain(cwd: string): Promise<string> {
  return (await runGit(cwd, ['status', '--porcelain'])).trimEnd();
}

export async function revParse(cwd: string, rev: string): Promise<string> {
  return (await runGit(cwd, ['rev-parse', '--short', rev])).trim();
}

export interface CommitOptions {
  subject: string;
  body: string;
}

export async function commit(cwd: string, opts: CommitOptions): Promise<void> {
  await runGit(cwd, ['commit', '-m', opts.subject, '-m', opts.body]);
}

export async function mergeSquash(cwd: string, featureBranch: string): Promise<void> {
  await runGit(cwd, ['merge', '--squash', featureBranch]);
}

export async function mergeFastForward(cwd: string, featureBranch: string): Promise<void> {
  await runGit(cwd, ['merge', '--ff-only', featureBranch]);
}

export async function mergeAbort(cwd: string): Promise<void> {
  await runGit(cwd, ['merge', '--abort']);
}

export async function deleteBranch(cwd: string, branch: string, force = false): Promise<void> {
  await runGit(cwd, ['branch', force ? '-D' : '-d', branch]);
}
