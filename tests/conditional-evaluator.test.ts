/**
 * Conditional expression evaluation: the cross-compiler operator matrix.
 * The same expressions and expectations are asserted in its-compiler-python
 * (test_conditional_evaluation.py) and its-compiler-dotnet
 * (ConditionalAndLimitTests.cs); keep the three in step.
 */

import { ConditionalEvaluator, translateConditionOperators } from '../src/conditional-evaluator';
import { ITSSecurityError, ContentElement } from '../src/types';

const variables: Record<string, any> = {
  a: true,
  b: 5,
  name: 'orders',
  items: ['first', 'second'],
  settings: { enabled: true },
};

describe('operator translation', () => {
  it('translates word operators to symbol forms outside string literals', () => {
    expect(translateConditionOperators('a and b')).toBe('a && b');
    expect(translateConditionOperators('a or not b')).toBe('a || ! b');
    expect(translateConditionOperators("x not in ['a', 'b']")).toBe("x notin ['a', 'b']");
    expect(translateConditionOperators("name == 'and or not'")).toBe("name == 'and or not'");
    expect(translateConditionOperators('android == 1')).toBe('android == 1');
  });
});

describe('operator matrix', () => {
  const evaluator = new ConditionalEvaluator();

  const cases: Array<[string, boolean]> = [
    ['a == true && b > 3', true],
    ['a == true and b > 3', true],
    ['!a || b == 10', false],
    ['not a or b == 5', true],
    ['b != 4', true],
    ['b != 5', false],
    ['1 < b <= 5', true],
    ['5 < b < 3', false],
    ["name == 'orders'", true],
    ["name in ['orders', 'invoices']", true],
    ["name not in ['orders', 'invoices']", false],
    ["'xyz' not in name", true],
    ["'ord' in name", true],
    ['-b < 0', true],
    ['items.length == 2', true],
    ["items[0] == 'first'", true],
    ["items[-1] == 'second'", true],
    ['settings.enabled == true', true],
  ];

  it.each(cases)('%s evaluates to %s', (condition, expected) => {
    expect(evaluator.evaluateCondition(condition, variables)).toBe(expected);
  });

  it('rejects undefined variables with a named error', () => {
    expect(() => evaluator.evaluateCondition('missing == 1', variables)).toThrow(
      /Variable 'missing' is not defined/
    );
  });

  it('rejects dangerous expressions as security errors', () => {
    expect(() => evaluator.evaluateCondition('eval("x")', variables)).toThrow(ITSSecurityError);
    expect(() => evaluator.evaluateCondition('a.__proto__.polluted == 1', variables)).toThrow(ITSSecurityError);
  });
});

describe('conditional content selection', () => {
  const evaluator = new ConditionalEvaluator();

  const conditional = (condition: string): ContentElement[] => [
    {
      type: 'conditional',
      condition,
      content: [{ type: 'text', text: 'YES' } as any],
      else: [{ type: 'text', text: 'NO' } as any],
    } as any,
  ];

  const texts = (content: ContentElement[]): string[] => content.map(element => (element as any).text);

  it('emits the content branch when the condition holds', () => {
    expect(texts(evaluator.evaluateContent(conditional('b == 5'), variables))).toEqual(['YES']);
  });

  it('emits the else branch when the condition fails', () => {
    expect(texts(evaluator.evaluateContent(conditional('b == 6'), variables))).toEqual(['NO']);
  });

  it('evaluates nested conditionals inside a selected branch', () => {
    const nested: ContentElement[] = [
      {
        type: 'conditional',
        condition: 'a',
        content: [
          { type: 'text', text: 'outer' } as any,
          {
            type: 'conditional',
            condition: 'b > 10',
            content: [{ type: 'text', text: 'inner-yes' } as any],
            else: [{ type: 'text', text: 'inner-no' } as any],
          } as any,
        ],
      } as any,
    ];
    expect(texts(evaluator.evaluateContent(nested, variables))).toEqual(['outer', 'inner-no']);
  });
});
