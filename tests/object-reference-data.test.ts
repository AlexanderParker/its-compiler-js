/**
 * Tests for object-valued references promoting to reference data: the
 * substitution becomes a textual pointer and the object renders once in
 * the REFERENCE DATA section.
 */

import { ITSCompiler } from '../src/compiler';
import { REFERENCE_DATA_INSTRUCTION } from '../src/reference-data';
import type { ITSTemplate } from '../src/types';

function template(text: string): ITSTemplate {
  return {
    version: '1.0.0',
    variables: {
      school: { name: 'Riverbank Secondary', students: 940 },
      product: { details: { weight: '1.2kg', battery: '12h' } },
    },
    content: [{ type: 'text', text } as any],
  } as ITSTemplate;
}

describe('object references as reference data', () => {
  let compiler: ITSCompiler;

  beforeEach(() => {
    compiler = new ITSCompiler();
  });

  it('substitutes a pointer and renders the object as a field table', async () => {
    const result = await compiler.compile(template('Prepared for ${school}.'));

    expect(result.prompt).toContain('Prepared for the school reference data.');
    expect(result.prompt).not.toContain('[Object with');
    expect(result.prompt).toContain('### school');
    expect(result.prompt).toContain('| name | Riverbank Secondary |');
    expect(result.prompt).toContain('| students | 940 |');
    expect(result.prompt).toContain(REFERENCE_DATA_INSTRUCTION);
  });

  it('handles nested object paths with the path as the section name', async () => {
    const result = await compiler.compile(template('Specs: ${product.details}.'));

    expect(result.prompt).toContain('Specs: the product.details reference data.');
    expect(result.prompt).toContain('### product.details');
    expect(result.prompt).toContain('| weight | 1.2kg |');
  });

  it('deduplicates with an explicit dataSource of the same name', async () => {
    const base = template('About ${school}.');
    base.content.push({
      type: 'placeholder',
      instructionType: 'summary',
      config: { description: 'Summarise the school reference data', dataSource: 'school' },
    } as any);
    base.customInstructionTypes = {
      summary: { template: '<<Summarise: ([{<{description}>}]).>>' },
    } as any;

    const result = await compiler.compile(base);

    expect(result.prompt.match(/### school/g)).toHaveLength(1);
  });

  it('leaves scalar and array substitution unchanged', async () => {
    const scalar = await compiler.compile(template('Name: ${school.name}, students: ${school.students}.'));

    expect(scalar.prompt).toContain('Name: Riverbank Secondary, students: 940.');
    expect(scalar.prompt).not.toContain('REFERENCE DATA');
  });
});
