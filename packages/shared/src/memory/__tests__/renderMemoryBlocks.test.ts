import { describe, it, expect } from 'bun:test';
import { renderMemoryBlocks } from '../renderMemoryBlocks.ts';
import type { MemoryBlock } from '../types.ts';

function mk(label: string, description: string, content: string): MemoryBlock {
  return { label, description, content, filePath: `/fake/${label}.md` };
}

describe('renderMemoryBlocks', () => {
  it('returns null for empty block list', () => {
    expect(renderMemoryBlocks([])).toBeNull();
  });

  it('wraps a single block in <memory_blocks>', () => {
    const out = renderMemoryBlocks([mk('persona', 'who Rowl is', 'I am Rowl.')]);
    expect(out).toBe(
      '<memory_blocks>\n' +
      '<memory_block label="persona" description="who Rowl is">\n' +
      'I am Rowl.\n' +
      '</memory_block>\n' +
      '</memory_blocks>',
    );
  });

  it('concatenates multiple blocks in the given order', () => {
    const out = renderMemoryBlocks([
      mk('human', 'what Rowl knows', 'Mario.'),
      mk('persona', 'who Rowl is', 'Agent.'),
    ]);
    expect(out).toContain('<memory_block label="human"');
    expect(out).toContain('<memory_block label="persona"');
    // Human comes before persona in output
    const humanIdx = out!.indexOf('label="human"');
    const personaIdx = out!.indexOf('label="persona"');
    expect(humanIdx).toBeLessThan(personaIdx);
  });

  it('escapes double quotes in description attribute', () => {
    const out = renderMemoryBlocks([mk('x', 'has a "quote"', 'body')]);
    expect(out).toContain('description="has a &quot;quote&quot;"');
  });

  it('escapes &, <, > in description attribute (in that order)', () => {
    const out = renderMemoryBlocks([mk('x', 'A & B <c> "d"', 'body')]);
    expect(out).toContain('description="A &amp; B &lt;c&gt; &quot;d&quot;"');
  });

  it('neutralizes literal </memory_block> inside body so it cannot terminate the wrapper', () => {
    const body = 'Here is prose that mentions </memory_block> literally and also </memory_blocks>.';
    const out = renderMemoryBlocks([mk('x', 'd', body)]);
    // The closing tokens must no longer match the wrapper's closing tags.
    expect(out).not.toMatch(/<\/memory_block>\nHere/);
    // Zero-width space appears between `<` and `/memory_block...` in the body.
    expect(out).toContain('<\u200B/memory_block>');
    expect(out).toContain('<\u200B/memory_blocks>');
    // Wrapper is still well-formed: exactly one opening and one closing wrapper tag.
    expect(out!.match(/<memory_blocks>/g)?.length).toBe(1);
    expect(out!.match(/<\/memory_blocks>/g)?.length).toBe(1);
    expect(out!.match(/<\/memory_block>/g)?.length).toBe(1);
  });

  it('leaves unrelated angle-bracket content in body untouched', () => {
    const body = 'Code: `<div class="x">hi</div>` and math: 3 < 4 && 5 > 2.';
    const out = renderMemoryBlocks([mk('x', 'd', body)]);
    expect(out).toContain(body);
  });

  it('trims trailing newline from content to avoid double blank lines', () => {
    const out = renderMemoryBlocks([mk('x', 'd', 'body\n')]);
    expect(out).toBe(
      '<memory_blocks>\n' +
      '<memory_block label="x" description="d">\n' +
      'body\n' +
      '</memory_block>\n' +
      '</memory_blocks>',
    );
  });
});
