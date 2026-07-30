/**
 * Tests for reference data sections: placeholders reference tabular data
 * sources by variable name via the reserved dataSource config key, and the
 * compiler renders them once above the template as non-output context.
 */

import { ITSCompiler } from '../src/compiler';
import { renderDataSource, REFERENCE_DATA_INSTRUCTION } from '../src/reference-data';
import type { ITSTemplate } from '../src/types';

function forecastTemplate(overrides: Partial<ITSTemplate> = {}): ITSTemplate {
  return {
    version: '1.0.0',
    customInstructionTypes: {
      summary: {
        template: '<<Summarise using this prompt: ([{<{description}>}]).>>',
      },
    },
    variables: {
      location: 'Adelaide',
      forecast: [
        { day: 'Monday', high: 29, wet: false },
        { day: 'Tuesday', high: 32, wet: false },
        { day: 'Sunday', high: 27, wet: true },
      ],
    },
    content: [
      { type: 'text', text: '# Briefing for ${location}\n\n' },
      {
        type: 'placeholder',
        instructionType: 'summary',
        config: {
          description: 'Summarise the trends in the forecast reference data',
          dataSource: 'forecast',
        },
      },
    ],
    ...overrides,
  } as ITSTemplate;
}

describe('reference data sections', () => {
  let compiler: ITSCompiler;

  beforeEach(() => {
    compiler = new ITSCompiler();
  });

  it('renders referenced variables as a table above the template', async () => {
    const result = await compiler.compile(forecastTemplate());

    expect(result.prompt).toContain('REFERENCE DATA');
    expect(result.prompt).toContain('### forecast');
    expect(result.prompt).toContain('| day | high | wet |');
    expect(result.prompt).toContain('| Monday | 29 | false |');
    expect(result.prompt).toContain(REFERENCE_DATA_INSTRUCTION);
    // The section sits above the template, and the template body stays clean
    expect(result.prompt.indexOf('REFERENCE DATA')).toBeLessThan(result.prompt.indexOf('TEMPLATE'));
    const templateSection = result.prompt.slice(result.prompt.indexOf('TEMPLATE'));
    expect(templateSection).not.toContain('| Monday |');
  });

  it('deduplicates sources referenced by multiple placeholders', async () => {
    const template = forecastTemplate();
    template.content.push({
      type: 'placeholder',
      instructionType: 'summary',
      config: { description: 'Recommendations from the forecast reference data', dataSource: ['forecast'] },
    } as any);

    const result = await compiler.compile(template);

    expect(result.prompt.match(/### forecast/g)).toHaveLength(1);
  });

  it('omits the section and instruction when no placeholder names a source', async () => {
    const template = forecastTemplate();
    delete (template.content[1] as any).config.dataSource;

    const result = await compiler.compile(template);

    expect(result.prompt).not.toContain('REFERENCE DATA');
    expect(result.prompt).not.toContain(REFERENCE_DATA_INSTRUCTION);
  });

  it('rejects unknown data source names', async () => {
    const template = forecastTemplate();
    (template.content[1] as any).config.dataSource = 'missing';

    await expect(compiler.compile(template)).rejects.toThrow(/Unknown data source 'missing'/);
  });

  it('skips sources referenced only inside excluded conditional branches', async () => {
    const template = forecastTemplate({
      variables: { location: 'Adelaide', includeSummary: false, forecast: [{ day: 'Monday', high: 29 }] },
    });
    template.content = [
      { type: 'text', text: 'Header\n' },
      {
        type: 'conditional',
        condition: 'includeSummary == true',
        content: [template.content[1]],
      } as any,
    ];

    const result = await compiler.compile(template);

    expect(result.prompt).not.toContain('REFERENCE DATA');
  });
});

describe('data limits', () => {
  let compiler: ITSCompiler;

  beforeEach(() => {
    compiler = new ITSCompiler();
  });

  it('caps included items at the placeholder dataLimit and states the truncation', async () => {
    const template = forecastTemplate();
    (template.content[1] as any).config.dataLimit = 2;

    const result = await compiler.compile(template);

    expect(result.prompt).toContain('| Monday | 29 | false |');
    expect(result.prompt).toContain('| Tuesday | 32 | false |');
    expect(result.prompt).not.toContain('| Sunday |');
    expect(result.prompt).toContain('Showing the first 2 of 3 items.');
  });

  it('uses the maximum limit when placeholders share a source', async () => {
    const template = forecastTemplate();
    (template.content[1] as any).config.dataLimit = 1;
    template.content.push({
      type: 'placeholder',
      instructionType: 'summary',
      config: { description: 'More from the forecast reference data', dataSource: 'forecast', dataLimit: 2 },
    } as any);

    const result = await compiler.compile(template);

    expect(result.prompt).toContain('Showing the first 2 of 3 items.');
    expect(result.prompt.match(/### forecast/g)).toHaveLength(1);
  });

  it('treats an unlimited reference as more generous than any limit', async () => {
    const template = forecastTemplate();
    (template.content[1] as any).config.dataLimit = 1;
    template.content.push({
      type: 'placeholder',
      instructionType: 'summary',
      config: { description: 'Everything from the forecast reference data', dataSource: 'forecast' },
    } as any);

    const result = await compiler.compile(template);

    expect(result.prompt).toContain('| Sunday | 27 | true |');
    expect(result.prompt).not.toContain('Showing the first');
  });

  it('ignores limits that do not truncate', async () => {
    const template = forecastTemplate();
    (template.content[1] as any).config.dataLimit = 50;

    const result = await compiler.compile(template);

    expect(result.prompt).toContain('| Sunday | 27 | true |');
    expect(result.prompt).not.toContain('Showing the first');
  });
});

describe('renderDataSource', () => {
  it('renders arrays of primitives as a list', () => {
    expect(renderDataSource(['a', 'b'])).toBe('- a\n- b');
  });

  it('renders plain objects as a field table', () => {
    expect(renderDataSource({ name: 'x', count: 2 })).toBe('| Field | Value |\n| --- | --- |\n| name | x |\n| count | 2 |');
  });

  it('renders nested values as compact JSON and escapes pipes', () => {
    expect(renderDataSource([{ a: { b: 1 }, note: 'x|y' }])).toBe('| a | note |\n| --- | --- |\n| {"b":1} | x\\|y |');
  });
});
