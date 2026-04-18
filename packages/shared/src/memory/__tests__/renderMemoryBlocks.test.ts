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
