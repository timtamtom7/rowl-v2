import type { SessionToolContext } from '../context.ts';
import type { ToolResult } from '../types.ts';
import { resolveSessionWorkingDirectory, resolveSessionWorkspaceRoot } from '../source-helpers.ts';
import { appendToBlock } from '@craft-agent/shared/memory';

export interface CoreMemoryAppendArgs {
  label: string;
  content: string;
}

/**
 * Handle core_memory_append.
 *
 * Resolves the project root via ctx.workingDirectory (falling back to session
 * header resolution), then delegates to the shared appendToBlock. Formats the
 * MemoryEditResult as text for the agent.
 */
export async function handleCoreMemoryAppend(
  ctx: SessionToolContext,
  args: CoreMemoryAppendArgs,
): Promise<ToolResult> {
  // Resolution order:
  //   1. ctx.workingDirectory — set when the session IPC seeds a project root.
  //   2. session.jsonl header `workingDirectory` — persisted per-session override.
  //   3. session.jsonl header `workspaceRootPath` — the workspace root used by
  //      Phase 1 for default memory-block materialization. This is the
  //      fallback that covers the common "Open folder" flow where no
  //      per-session workingDirectory is explicitly set.
  const workingDirectory =
    ctx.workingDirectory
    ?? resolveSessionWorkingDirectory(ctx.workspacePath, ctx.sessionId)
    ?? resolveSessionWorkspaceRoot(ctx.workspacePath, ctx.sessionId);

  if (!workingDirectory) {
    return {
      content: [
        {
          type: 'text',
          text: 'error: no workspace working directory — memory tools require a project root',
        },
      ],
      isError: true,
    };
  }

  const result = await appendToBlock({
    workspaceRootPath: workingDirectory,
    label: args.label,
    content: args.content,
  });

  if (result.ok) {
    const lines = [`ok (new size: ${result.newSize} bytes)`];
    if (result.warnings) lines.push(...result.warnings.map((w) => `warning: ${w}`));
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
  return {
    content: [{ type: 'text', text: `error: ${result.message}` }],
    isError: true,
  };
}
