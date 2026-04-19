import type { SessionToolContext } from '../context.ts';
import type { ToolResult } from '../types.ts';
import { resolveSessionWorkingDirectory } from '../source-helpers.ts';
import { replaceInBlock } from '@craft-agent/shared/memory';

export interface CoreMemoryReplaceArgs {
  label: string;
  old_content: string;
  new_content: string;
}

/**
 * Handle core_memory_replace.
 *
 * Resolves the project root via ctx.workingDirectory (falling back to session
 * header resolution — same pattern as handleSkillValidate), then delegates to
 * the shared replaceInBlock. Formats the MemoryEditResult as text for the agent.
 */
export async function handleCoreMemoryReplace(
  ctx: SessionToolContext,
  args: CoreMemoryReplaceArgs,
): Promise<ToolResult> {
  const workingDirectory =
    ctx.workingDirectory
    ?? resolveSessionWorkingDirectory(ctx.workspacePath, ctx.sessionId);

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

  const result = await replaceInBlock({
    workspaceRootPath: workingDirectory,
    label: args.label,
    oldContent: args.old_content,
    newContent: args.new_content,
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
