/**
 * Tests for collection functions in variable references:
 * concat, sum, avg, min, max and top, chainable after a path.
 */

import { ITSCompiler } from '../src/compiler';
import { VariableProcessor } from '../src/variable-processor';
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
    expect(await compileText('sum=${forecast.sum(high)}.')).toContain('sum=82.');
    expect(await compileText('sum=${scores.sum()}.')).toContain('sum=15.');
    expect(await compileText('avg=${scores.avg()}.')).toContain('avg=5.');
    expect(await compileText('min=${forecast.min(high)}.')).toContain('min=24.');
    expect(await compileText('max=${forecast.max(high)}.')).toContain('max=31.');
  });

  it('top slices and chains with concat', async () => {
    expect(await compileText('${forecast.top(2).concat(day)}')).toContain('Monday, Tuesday');
    expect(await compileText('${tags.top(1).concat()}')).toContain('solar');
  });

  it('booleans concat JSON-style', async () => {
    expect(await compileText('${forecast.concat(wet)}')).toContain('false, true, false');
  });

  it('rejects invalid usages with distinct messages', () => {
    const processor = new VariableProcessor();
    const vars = template('').variables as Record<string, any>;

    expect(() => processor.resolveVariableReference('forecast[0].sum(high)', vars)).toThrow(
      /sum\(\) requires an array/
    );
    expect(() => processor.resolveVariableReference('forecast.sum(missing)', vars)).toThrow(
      /Property 'missing' not found on every item/
    );
    expect(() => processor.resolveVariableReference('forecast.sum(day)', vars)).toThrow(
      /sum\(\) requires numeric values/
    );
    expect(() => processor.resolveVariableReference('forecast.top(x)', vars)).toThrow(
      /top\(\) requires a non-negative integer/
    );
    expect(() => processor.resolveVariableReference('scores.avg(', vars)).toThrow(/Invalid variable reference syntax/);
    expect(() => processor.resolveVariableReference('forecast.concat(day).sum()', vars)).toThrow(
      /sum\(\) requires an array/
    );
  });

  it('surfaces invalid usages as validation failures at compile time', async () => {
    // The compile path wraps the message; the specific cause is in validationErrors
    expect.assertions(2);
    try {
      await compileText('${forecast.sum(day)}');
    } catch (error: any) {
      expect(error.message).toBe('Template validation failed');
      expect(error.validationErrors.join('\n')).toMatch(/sum\(\) requires numeric values/);
    }
  });
});
