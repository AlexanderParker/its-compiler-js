/**
 * Cross-compiler type-rendering parity.
 *
 * The golden-prompt test compares one whole template byte-for-byte, which is
 * a strong check but a narrow one: the template it uses contains no `false`,
 * no `null` and no negative numbers. A boolean rendering divergence lived in
 * the compilers for months and reached the published example outputs without
 * failing anything.
 *
 * This fixture exists to be broad instead. Every line is `name=${expression}`,
 * so a divergence names itself. The same fixture and the same expectations are
 * asserted by its-compiler (Python) and Its.Compiler (.NET), which is what
 * makes it a parity test rather than a snapshot.
 *
 * If a value here changes, the three compilers have diverged. Fix the
 * divergence; do not edit the expectation to match one implementation.
 */

import * as path from 'path';
import { ITSCompiler } from '../src/compiler';

const FIXTURE = path.join(__dirname, 'fixtures', 'type-rendering.json');

/** The canonical rendering every implementation must produce. */
const EXPECTED: Record<string, string> = {
  // Booleans and null are lowercase words, never a language's own spelling.
  // Python produced True/False/None and .NET rendered null as an empty
  // string, which lost the difference between null and "".
  'bool-true': 'true',
  'bool-false': 'false',
  null: 'null',

  // Whole values carry no decimal part, however they were written.
  'whole-float': '1',
  fraction: '0.5',
  repeating: '0.1',
  negative: '-42',
  'negative-fraction': '-0.25',
  zero: '0',
  big: '1000000000000000',

  // Exponents: lowercase e, no plus, no leading zeros. Python gave 1e-07 and
  // .NET gave 1E-07 before this was pinned down.
  small: '1e-7',
  precise: '1.005',

  // Arrays join with ", " after each element is rendered by the same rules.
  'array-strings': 'alpha, beta',
  'array-mixed': '1, true, null, x, 2.5',

  unicode: 'café — naïve ☂',
  quoted: 'she said "hi"',

  'len-array': '2',
  'len-string': '14',

  // Float arithmetic is IEEE 754 everywhere, so the artefacts must match too.
  'sum-int': '10',
  'avg-int': '2.5',
  min: '1',
  max: '4',
  'sum-float': '0.30000000000000004',
  'avg-thirds': '1',
  'avg-money': '0.15000000000000002',

  'concat-scalars': 'alpha, beta',
  'concat-mixed': '1, true, null, x, 2.5',
  'concat-prop': 'a, b',
  'sum-prop': '4',
  'concat-flags': 'true, false',

  top2: '1, 2',
  'index-neg': 'beta',
  'index-0': 'alpha',

  'cond-bool': 'taken',
  'cond-float-eq-int': 'taken',
  'cond-in-and-negative': 'taken',
};

function parse(prompt: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of prompt.split(/\r?\n/)) {
    const match = /^([a-z0-9-]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

describe('type rendering parity', () => {
  let rendered: Record<string, string>;

  beforeAll(async () => {
    // The fixture extends nothing and has no placeholders, so this needs no
    // network and no schema files.
    const result = await new ITSCompiler().compileFile(FIXTURE);
    rendered = parse(result.prompt);
  });

  it('renders every value in the fixture', () => {
    expect(Object.keys(rendered).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.entries(EXPECTED))('renders %s as %s', (key, expected) => {
    expect(rendered[key]).toBe(expected);
  });
});
