import type { MemoryBlock } from './types.ts';

/**
 * Render a set of memory blocks into an XML wrapper for injection
 * into the user message. Returns `null` for an empty list so callers
 * can skip emitting the wrapper entirely.
 *
 * Body content is otherwise rendered verbatim (it is markdown prose, and
 * arbitrary `<` / `&` in content are useful to the agent — e.g. code samples).
 * The one exception: literal `</memory_block>` / `</memory_blocks>` tokens in
 * body content are neutralized by inserting a zero-width space so they can't
 * prematurely terminate the wrapper. This is a defensive measure — the model
 * still reads the glyphs as the intended text.
 */
export function renderMemoryBlocks(blocks: MemoryBlock[]): string | null {
  if (blocks.length === 0) return null;

  const inner = blocks
    .map((b) => {
      const descAttr = escapeAttr(b.description);
      const body = neutralizeClosingTags(b.content.replace(/\n+$/, ''));
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

/**
 * Insert a zero-width space after `</` in any literal closing wrapper tag so
 * it no longer matches as a tag but still reads identically to the model.
 * Covers both `</memory_block>` and `</memory_blocks>`.
 */
function neutralizeClosingTags(body: string): string {
  return body.replace(/<\/(memory_blocks?)>/g, '<\u200B/$1>');
}
