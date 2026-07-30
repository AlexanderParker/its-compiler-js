/**
 * Tests for configurable variable payload limits.
 */

import { ITSCompiler } from '../src/compiler';
import { DEFAULT_SECURITY_CONFIG } from '../src/security';
import type { ITSTemplate, SecurityConfig } from '../src/types';

function datasetTemplate(rows: number): ITSTemplate {
  return {
    version: '1.0.0',
    customInstructionTypes: {
      summary: { template: '<<Summarise using this prompt: ([{<{description}>}]).>>' },
    },
    variables: { rows: Array.from({ length: rows }, (_, i) => ({ n: i })) },
    content: [
      {
        type: 'placeholder',
        instructionType: 'summary',
        config: { description: 'Summarise the rows reference data', dataSource: 'rows', dataLimit: 5 },
      } as any,
    ],
  } as ITSTemplate;
}

function compilerWith(overrides: Partial<SecurityConfig> = {}): ITSCompiler {
  return new ITSCompiler({ ...DEFAULT_SECURITY_CONFIG, ...overrides });
}

describe('configurable limits', () => {
  it('accepts reference datasets under the default limits', async () => {
    const result = await compilerWith().compile(datasetTemplate(500));
    expect(result.prompt).toContain('Showing the first 5 of 500 items.');
  });

  it('enforces a configured total variable count', async () => {
    await expect(compilerWith({ maxVariableCount: 50 }).compile(datasetTemplate(60))).rejects.toThrow(
      /Too many variables/
    );
  });

  it('enforces a configured array items limit', async () => {
    await expect(compilerWith({ maxVariableArrayItems: 10 }).compile(datasetTemplate(11))).rejects.toThrow(
      /Array too large/
    );
  });

  it('enforces a configured text length on string values', async () => {
    const template = datasetTemplate(1);
    (template.variables as any).note = 'x'.repeat(50);

    await expect(compilerWith({ maxTextLength: 40 }).compile(template)).rejects.toThrow(/Text content too long/);
  });
});
