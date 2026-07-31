/**
 * Conditional expression evaluation for ITS Compiler using jsep for safety
 */

import jsep from 'jsep';
import { ITSSecurityError, ContentElement } from './types.js';

// Spec membership operators; same precedence as the comparison operators
jsep.addBinaryOp('in', 7);
jsep.addBinaryOp('notin', 7);

const COMPARISON_OPERATORS = new Set(['==', '===', '!=', '!==', '<', '<=', '>', '>=']);

/**
 * Translates the spec's word-form operators (and, or, not, not in) to the
 * symbol forms jsep parses, leaving string literals untouched.
 */
export function translateConditionOperators(condition: string): string {
  let result = '';
  let i = 0;
  while (i < condition.length) {
    const char = condition[i];
    if (char === '"' || char === "'") {
      let j = i + 1;
      while (j < condition.length && condition[j] !== char) {
        j++;
      }
      result += condition.slice(i, Math.min(j + 1, condition.length));
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < condition.length && condition[j] !== '"' && condition[j] !== "'") {
      j++;
    }
    result += condition
      .slice(i, j)
      .replace(/\bnot\s+in\b/g, 'notin')
      .replace(/\band\b/g, '&&')
      .replace(/\bor\b/g, '||')
      .replace(/\bnot\b/g, '!');
    i = j;
  }
  return result;
}

export class ConditionalEvaluator {
  private maxExpressionLength: number;

  constructor(maxExpressionLength: number = 500) {
    this.maxExpressionLength = maxExpressionLength;
  }

  /**
   * Evaluate conditionals in content and return filtered content
   */
  evaluateContent(content: ContentElement[], variables: Record<string, any>): ContentElement[] {
    const result: ContentElement[] = [];

    for (const element of content) {
      if (element.type === 'conditional') {
        const conditionalElement = element as any;
        const conditionResult = this.evaluateCondition(conditionalElement.condition, variables);

        if (conditionResult) {
          // Include content from the 'content' array
          const nestedContent = this.evaluateContent(conditionalElement.content, variables);
          result.push(...nestedContent);
        } else if (conditionalElement.else) {
          // Include content from the 'else' array
          const elseContent = this.evaluateContent(conditionalElement.else, variables);
          result.push(...elseContent);
        }
      } else {
        // Non-conditional element, include as-is
        result.push(element);
      }
    }

    return result;
  }

  /**
   * Evaluate a conditional expression using jsep for safety
   */
  evaluateCondition(condition: string, variables: Record<string, any>): boolean {
    // Basic security validation
    this.validateConditionSecurity(condition);

    try {
      // Parse the expression into AST
      const ast = jsep(translateConditionOperators(condition));

      // Evaluate the AST safely
      const result = this.evaluateASTNode(ast, variables);
      return Boolean(result);
    } catch (error) {
      throw new ITSSecurityError(
        `Error evaluating condition '${condition}': ${error}`,
        'conditional_evaluation',
        'EXPRESSION_ERROR'
      );
    }
  }

  /**
   * Security validation for conditional expressions
   */
  private validateConditionSecurity(condition: string): void {
    if (condition.length > this.maxExpressionLength) {
      throw new ITSSecurityError(
        `Condition too long: ${condition.length} characters`,
        'expression_length',
        'SIZE_LIMIT_EXCEEDED'
      );
    }

    // Check for dangerous patterns that might bypass jsep
    const dangerousPatterns = [
      /\b(eval|exec|function|Function|setTimeout|setInterval)\s*\(/i,
      /\b(import|require|global|window|document|process)\b/i,
      /__\w+__/,
      /\.\s*constructor\s*\./,
      /\.\s*prototype\s*\./,
      /\.\s*__proto__\s*\./,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(condition)) {
        throw new ITSSecurityError(
          'Dangerous pattern detected in condition',
          'expression_validation',
          'MALICIOUS_CONTENT'
        );
      }
    }
  }

  /**
   * Safely evaluate an AST node
   */
  private evaluateASTNode(node: any, variables: Record<string, any>): any {
    if (!node || typeof node !== 'object') {
      throw new Error('Invalid AST node');
    }

    switch (node.type) {
      case 'Literal':
        return node.value;

      case 'Identifier':
        if (!(node.name in variables)) {
          throw new Error(`Variable '${node.name}' is not defined`);
        }
        return variables[node.name];

      case 'MemberExpression': {
        const object = this.evaluateASTNode(node.object, variables);

        if (object === null || object === undefined) {
          throw new Error('Cannot access property of null or undefined');
        }

        let property: string | number;
        if (node.computed) {
          // For array access like obj[0] or obj[key]
          property = this.evaluateASTNode(node.property, variables);
        } else {
          // For property access like obj.prop
          property = node.property.name;
        }

        // Handle special properties
        if (property === 'length' && (Array.isArray(object) || typeof object === 'string')) {
          return object.length;
        }

        // Validate property access for security
        this.validatePropertyAccess(object, property);

        if (Array.isArray(object) && typeof property === 'number' && property < 0) {
          return object[object.length + property];
        }
        return object[property];
      }

      case 'BinaryExpression': {
        if (node.operator === 'in' || node.operator === 'notin') {
          const item = this.evaluateASTNode(node.left, variables);
          const container = this.evaluateASTNode(node.right, variables);
          const contained = this.testMembership(item, container);
          return node.operator === 'in' ? contained : !contained;
        }

        // Comparisons chain like the spec (1 < x <= 5 means both halves),
        // not left-associatively on the boolean result
        if (COMPARISON_OPERATORS.has(node.operator)) {
          return this.evaluateComparisonChain(node, variables);
        }

        const left = this.evaluateASTNode(node.left, variables);
        const right = this.evaluateASTNode(node.right, variables);

        switch (node.operator) {
          // Handle logical operators in case jsep treats them as binary
          case '&&':
            return left && right;
          case '||':
            return left || right;
          default:
            throw new Error(`Unsupported binary operator: ${node.operator}`);
        }
      }

      case 'LogicalExpression': {
        const leftVal = this.evaluateASTNode(node.left, variables);

        switch (node.operator) {
          case '&&':
            // Short-circuit evaluation
            return leftVal && this.evaluateASTNode(node.right, variables);
          case '||':
            // Short-circuit evaluation
            return leftVal || this.evaluateASTNode(node.right, variables);
          case 'and':
            // Support 'and' keyword as well
            return leftVal && this.evaluateASTNode(node.right, variables);
          case 'or':
            // Support 'or' keyword as well
            return leftVal || this.evaluateASTNode(node.right, variables);
          default:
            throw new Error(`Unsupported logical operator: ${node.operator}`);
        }
      }

      case 'UnaryExpression': {
        switch (node.operator) {
          case '!':
            return !this.evaluateASTNode(node.argument, variables);
          case '-':
            return -this.evaluateASTNode(node.argument, variables);
          case '+':
            return +this.evaluateASTNode(node.argument, variables);
          default:
            throw new Error(`Unsupported unary operator: ${node.operator}`);
        }
      }

      case 'ArrayExpression':
        // Allow simple array literals like [1, 2, 3]
        return node.elements.map((element: any) => this.evaluateASTNode(element, variables));

      default:
        throw new Error(`Unsupported expression type: ${node.type}`);
    }
  }

  private evaluateComparisonChain(node: any, variables: Record<string, any>): boolean {
    const operands: any[] = [];
    const operators: string[] = [];
    let current = node;
    while (
      current.type === 'BinaryExpression' &&
      COMPARISON_OPERATORS.has(current.operator) &&
      current.left?.type === 'BinaryExpression' &&
      COMPARISON_OPERATORS.has(current.left.operator)
    ) {
      operators.unshift(current.operator);
      operands.unshift(current.right);
      current = current.left;
    }
    operators.unshift(current.operator);
    operands.unshift(current.left, current.right);

    let left = this.evaluateASTNode(operands[0], variables);
    for (let i = 0; i < operators.length; i++) {
      const right = this.evaluateASTNode(operands[i + 1], variables);
      if (!this.applyComparison(operators[i], left, right)) {
        return false;
      }
      left = right;
    }
    return true;
  }

  private applyComparison(operator: string, left: any, right: any): boolean {
    switch (operator) {
      case '==':
        return left == right;
      case '===':
        return left === right;
      case '!=':
        return left != right;
      case '!==':
        return left !== right;
      case '<':
        return left < right;
      case '<=':
        return left <= right;
      case '>':
        return left > right;
      default:
        return left >= right;
    }
  }

  private testMembership(item: any, container: any): boolean {
    if (Array.isArray(container)) {
      return container.includes(item);
    }
    if (typeof container === 'string') {
      if (typeof item !== 'string') {
        throw new Error(`'in' on a string requires a string left operand`);
      }
      return container.includes(item);
    }
    throw new Error(`'in' requires an array or string right operand`);
  }

  /**
   * Validate property access for security
   */
  private validatePropertyAccess(object: any, property: string | number): void {
    // Block access to dangerous properties
    const dangerousProperties = new Set([
      'constructor',
      'prototype',
      '__proto__',
      '__defineGetter__',
      '__defineSetter__',
      '__lookupGetter__',
      '__lookupSetter__',
    ]);

    if (typeof property === 'string' && dangerousProperties.has(property)) {
      throw new ITSSecurityError(
        `Access to dangerous property '${property}' is blocked`,
        'property_access',
        'MALICIOUS_CONTENT'
      );
    }

    // Additional validation for function objects
    if (typeof object === 'function') {
      throw new ITSSecurityError(
        'Property access on function objects is not allowed',
        'function_property_access',
        'MALICIOUS_CONTENT'
      );
    }

    // Validate array bounds
    if (Array.isArray(object) && typeof property === 'number') {
      if (property < 0) {
        // Support negative indexing
        const actualIndex = object.length + property;
        if (actualIndex < 0 || actualIndex >= object.length) {
          throw new Error(`Array index ${property} out of bounds`);
        }
      } else if (property >= object.length) {
        throw new Error(`Array index ${property} out of bounds`);
      }
    }
  }

  /**
   * Validate condition syntax using jsep
   */
  validateCondition(condition: string, variables: Record<string, any>): string[] {
    const errors: string[] = [];

    try {
      this.validateConditionSecurity(condition);

      // Try to parse with jsep
      const ast = jsep(translateConditionOperators(condition));

      // Try to evaluate
      this.evaluateASTNode(ast, variables);
    } catch (error) {
      if (error instanceof ITSSecurityError) {
        errors.push(error.message);
      } else if (error instanceof Error) {
        errors.push(`Condition validation failed: ${error.message}`);
      } else {
        errors.push(`Condition validation failed: ${error}`);
      }
    }

    return errors;
  }
}
