import type { MemoryBlock } from './types.ts';

/**
 * Render a set of memory blocks into an XML wrapper for injection
 * into the user message. Returns `null` for an empty list so callers
 * can skip emitting the wrapper entirely.
 */
export function renderMemoryBlocks(blocks: MemoryBlock[]): string | null {
  if (blocks.length === 0) return null;

  const inner = blocks
    .map((b) => {
      const descAttr = escapeAttr(b.description);
      const body = b.content.replace(/\n+$/, '');
      return `<memory_block label="${b.label}" description="${descAttr}">\n${body}\n</memory_block>`;
    })
    .join('\n');

  return `<memory_blocks>\n${inner}\n</memory_blocks>`;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
