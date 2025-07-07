/**
 * Conditional expression evaluation for ITS Compiler
 */

import { ITSSecurityError, ContentElement } from './types.js';

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
   * Evaluate a conditional expression
   */
  evaluateCondition(condition: string, variables: Record<string, any>): boolean {
    // Basic security validation
    this.validateConditionSecurity(condition);

    try {
      // Parse and evaluate the condition
      const result = this.evaluateExpression(condition, variables);
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

    // Check for dangerous patterns
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
   * Simple expression evaluator with support for boolean operators
   */
  private evaluateExpression(expression: string, variables: Record<string, any>): any {
    // Normalize the expression by replacing logical operators
    let processedExpression = expression.trim();

    // Replace boolean operators with JavaScript equivalents
    processedExpression = processedExpression.replace(/\band\b/g, '&&');
    processedExpression = processedExpression.replace(/\bor\b/g, '||');
    processedExpression = processedExpression.replace(/\bnot\b/g, '!');

    // Replace variable references
    processedExpression = this.replaceVariableReferences(processedExpression, variables);

    try {
      // Use Function constructor for safe evaluation
      const func = new Function('return ' + processedExpression);
      return func();
    } catch (error) {
      throw new Error(`Invalid expression: ${expression}`);
    }
  }

  /**
   * Replace variable references in expression with actual values
   */
  private replaceVariableReferences(expression: string, variables: Record<string, any>): string {
    let processed = expression;

    // Handle property access and array indexing first
    processed = this.handlePropertyAccess(processed, variables);

    // Handle simple variable references
    for (const [key, value] of Object.entries(variables)) {
      // Use word boundaries to avoid partial replacements
      const regex = new RegExp(`\\b${this.escapeRegExp(key)}\\b`, 'g');
      processed = processed.replace(regex, JSON.stringify(value));
    }

    // Handle boolean literals
    processed = processed.replace(/\btrue\b/g, 'true');
    processed = processed.replace(/\bfalse\b/g, 'false');

    return processed;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Handle property access in expressions
   */
  private handlePropertyAccess(expression: string, variables: Record<string, any>): string {
    let processed = expression;

    // Handle complex property paths like object.property and array[index]
    const propertyPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*|\[[0-9-]+\])*)\b/g;

    processed = processed.replace(propertyPattern, match => {
      try {
        // Skip if it's already a literal value or operator
        if (/^(true|false|null|undefined|\d+|&&|\|\||==|!=|<=|>=|<|>)$/.test(match)) {
          return match;
        }

        const value = this.resolveVariablePath(match, variables);
        return JSON.stringify(value);
      } catch (error) {
        // If we can't resolve it, leave it as-is for now
        return match;
      }
    });

    return processed;
  }

  /**
   * Resolve a variable path like "object.property" or "array[0]"
   */
  private resolveVariablePath(path: string, variables: Record<string, any>): any {
    const parts = this.parseVariablePath(path);
    let current: any = variables;

    for (const part of parts) {
      if (part.type === 'property') {
        // Handle special properties
        if (part.name === 'length' && (Array.isArray(current) || typeof current === 'string')) {
          return current.length;
        }

        if (typeof current !== 'object' || current === null) {
          throw new Error(`Cannot access property '${part.name}' on non-object value`);
        }

        if (part.name && !(part.name in current)) {
          throw new Error(`Property '${part.name}' not found`);
        }

        if (part.name) {
          current = current[part.name];
        }
      } else if (part.type === 'index') {
        if (!Array.isArray(current)) {
          throw new Error(`Cannot access array index on non-array value`);
        }

        if (part.index !== undefined) {
          if (part.index < 0) {
            // Support negative indexing
            const actualIndex = current.length + part.index;
            if (actualIndex < 0 || actualIndex >= current.length) {
              throw new Error(`Array index ${part.index} out of bounds`);
            }
            current = current[actualIndex];
          } else {
            if (part.index >= current.length) {
              throw new Error(`Array index ${part.index} out of bounds`);
            }
            current = current[part.index];
          }
        }
      }
    }

    return current;
  }

  /**
   * Parse variable path into components
   */
  private parseVariablePath(path: string): Array<{ type: 'property' | 'index'; name?: string; index?: number }> {
    const parts: Array<{ type: 'property' | 'index'; name?: string; index?: number }> = [];
    let current = '';
    let i = 0;

    while (i < path.length) {
      const char = path[i];

      if (char === '.') {
        if (current) {
          parts.push({ type: 'property', name: current });
          current = '';
        }
      } else if (char === '[') {
        if (current) {
          parts.push({ type: 'property', name: current });
          current = '';
        }

        // Parse array index
        i++; // Skip '['
        let indexStr = '';
        while (i < path.length && path[i] !== ']') {
          indexStr += path[i];
          i++;
        }

        if (i >= path.length || path[i] !== ']') {
          throw new Error(`Malformed array index in path: ${path}`);
        }

        const index = parseInt(indexStr, 10);
        if (isNaN(index)) {
          throw new Error(`Invalid array index: ${indexStr}`);
        }

        parts.push({ type: 'index', index });
      } else {
        current += char;
      }

      i++;
    }

    if (current) {
      parts.push({ type: 'property', name: current });
    }

    return parts;
  }

  /**
   * Validate condition syntax
   */
  validateCondition(condition: string, variables: Record<string, any>): string[] {
    const errors: string[] = [];

    try {
      this.validateConditionSecurity(condition);
      this.evaluateCondition(condition, variables);
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
