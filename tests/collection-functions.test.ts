/**
 * Tests for collection functions in variable references:
 * concat, sum, avg, min, max and top, chainable after a path.
 */

import { ITSCompiler } from '../src/compiler';
import type { ITSTemplate } from '../src/types';

function template(text: string): ITSTemplate {
  return {
    version: '1.0.0',
    variables: {
      forecast: [
        { day: 'Monday', high: 24, wet: false },
        { day: 'Tuesday', high: 31, wet: true },
        { day: 'Wednesday', high: 27, wet: false },
      ],
      tags: ['solar', 'garden', 'lantern'],
      scores: [2, 4, 9],
    },
    content: [{ type: 'text', text } as any],
  } as ITSTemplate;
}

async function compileText(text: string): Promise<string> {
  const result = await new ITSCompiler().compile(template(text));
  return result.prompt.slice(result.prompt.indexOf('TEMPLATE'));
}

describe('collection functions', () => {
  it('concat joins property values and plain items', async () => {
    expect(await compileText('${forecast.concat(day)}')).toContain('Monday, Tuesday, Wednesday');
    expect(await compileText('${tags.concat()}')).toContain('solar, garden, lantern');
  });

  it('sum, avg, min and max aggregate numeric values', async () => {
    expect(await compileText('${forecast.sum(high)}')).toContain('82');
    expect(await compileText('${scores.sum()}')).toContain('15');
    expect(await compileText('${scores.avg()}')).toContain('5');
    expect(await compileText('${forecast.min(high)}')).toContain('24');
    expect(await compileText('${forecast.max(high)}')).toContain('31');
  });

  it('top slices and chains with concat', async () => {
    expect(await compileText('${forecast.top(2).concat(day)}')).toContain('Monday, Tuesday');
    expect(await compileText('${tags.top(1).concat()}')).toContain('solar');
  });

  it('booleans concat JSON-style', async () => {
    expect(await compileText('${forecast.concat(wet)}')).toContain('false, true, false');
  });

  it('rejects functions on non-arrays and unknown properties', async () => {
    // Invalid usages are caught during template validation before compile
    await expect(compileText('${forecast[0].sum(high)}')).rejects.toThrow();
    await expect(compileText('${forecast.sum(missing)}')).rejects.toThrow();
    await expect(compileText('${forecast.sum(day)}')).rejects.toThrow();
    await expect(compileText('${forecast.top(x)}')).rejects.toThrow();
  });
});
