/**
 * Variable reference resolution: paths, indices, .length and error messages.
 * Mirrors its-compiler-python test_variable_resolution.py and the composed
 * substitution assertions in its-compiler-dotnet.
 */

import { VariableProcessor } from '../src/variable-processor';
import { ContentElement } from '../src/types';

const variables: Record<string, any> = {
  product: {
    name: 'Lantern',
    price: 39.5,
    features: ['solar', 'waterproof'],
    maker: { address: { city: 'Adelaide' } },
  },
  tags: ['a', 'b', 'c'],
  title: 'Hello world',
};

describe('resolveVariableReference', () => {
  const processor = new VariableProcessor();

  it('resolves dotted paths, indices and negative indices', () => {
    expect(processor.resolveVariableReference('product.name', variables)).toBe('Lantern');
    expect(processor.resolveVariableReference('product.maker.address.city', variables)).toBe('Adelaide');
    expect(processor.resolveVariableReference('product.features[0]', variables)).toBe('solar');
    expect(processor.resolveVariableReference('product.features[-1]', variables)).toBe('waterproof');
    expect(processor.resolveVariableReference('tags[1]', variables)).toBe('b');
  });

  it('resolves .length on arrays and strings', () => {
    expect(processor.resolveVariableReference('tags.length', variables)).toBe(3);
    expect(processor.resolveVariableReference('title.length', variables)).toBe(11);
  });

  it('reports out-of-bounds indices with the bounds', () => {
    expect(() => processor.resolveVariableReference('tags[7]', variables)).toThrow(
      /Array index 7 out of bounds for array of length 3/
    );
    expect(() => processor.resolveVariableReference('tags[-4]', variables)).toThrow(
      /Array index -4 out of bounds for array of length 3/
    );
  });

  it('reports missing properties and non-object access by name', () => {
    expect(() => processor.resolveVariableReference('product.colour', variables)).toThrow(/Property 'colour' not found/);
    expect(() => processor.resolveVariableReference('title.missing', variables)).toThrow(
      /Cannot access property 'missing' on non-object value/
    );
    expect(() => processor.resolveVariableReference('missing.name', variables)).toThrow(/Property 'missing' not found/);
  });

  it('rejects malformed reference syntax', () => {
    for (const bad of ['product..name', '__proto__', 'product.name!', '1product']) {
      expect(() => processor.resolveVariableReference(bad, variables)).toThrow(/Invalid variable reference syntax/);
    }
  });
});

describe('substitution into content', () => {
  const processor = new VariableProcessor();

  const textOf = (content: ContentElement[]): string => (content[0] as any).text;

  it('substitutes a composed line of paths, arrays, lengths and indices', () => {
    const content: ContentElement[] = [
      {
        type: 'text',
        text:
          '${product.name} at ${product.price}: ${product.features} (${product.features.length});' +
          ' first=${product.features[0]}, last=${product.features[-1]}',
      } as any,
    ];
    expect(textOf(processor.processContent(content, variables))).toBe(
      'Lantern at 39.5: solar, waterproof (2); first=solar, last=waterproof'
    );
  });

  it('substitutes array values as a comma-separated list', () => {
    const content: ContentElement[] = [{ type: 'text', text: 'tags: ${tags}' } as any];
    expect(textOf(processor.processContent(content, variables))).toBe('tags: a, b, c');
  });
});
