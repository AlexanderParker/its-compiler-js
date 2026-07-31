/**
 * Variable processing and substitution for ITS Compiler
 */

import { ITSVariableError, ContentElement, TextElement, PlaceholderElement, ConditionalElement } from './types.js';

export class VariableProcessor {
  private static VARIABLE_PATTERN = /\$\{([^}]+)\}/g;

  private maxTextLength: number;

  constructor(maxTextLength: number = 10000) {
    this.maxTextLength = maxTextLength;
  }

  /**
   * Process variable references in content elements. When objectReferences
   * is provided, references resolving to plain objects substitute a pointer
   * ("the settings reference data") and the object is collected so the
   * compiler can render it in the REFERENCE DATA section.
   */
  processContent(
    content: ContentElement[],
    variables: Record<string, any>,
    objectReferences?: Map<string, any>
  ): ContentElement[] {
    return content.map(element => this.processElement(element, variables, objectReferences));
  }

  /**
   * Process variables in a single content element
   */
  private processElement(
    element: ContentElement,
    variables: Record<string, any>,
    objectReferences?: Map<string, any>
  ): ContentElement {
    if (element.type === 'text') {
      const textElement = element as TextElement;
      return {
        ...element,
        text: this.processString(textElement.text, variables, objectReferences),
      } as TextElement;
    }

    if (element.type === 'placeholder') {
      const placeholderElement = element as PlaceholderElement;
      return {
        ...element,
        config: this.processObject(placeholderElement.config, variables, objectReferences),
      } as PlaceholderElement;
    }

    if (element.type === 'conditional') {
      const conditionalElement = element as ConditionalElement;
      return {
        ...element,
        condition: this.processString(conditionalElement.condition, variables),
        content: this.processContent(conditionalElement.content, variables, objectReferences),
        else: conditionalElement.else
          ? this.processContent(conditionalElement.else, variables, objectReferences)
          : undefined,
      } as ConditionalElement;
    }

    return element;
  }

  /**
   * Process variables in an object
   */
  private processObject(obj: any, variables: Record<string, any>, objectReferences?: Map<string, any>): any {
    if (typeof obj === 'string') {
      return this.processString(obj, variables, objectReferences);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.processObject(item, variables, objectReferences));
    }

    if (typeof obj === 'object' && obj !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.processObject(value, variables, objectReferences);
      }
      return result;
    }

    return obj;
  }

  /**
   * Process variable references in a string
   */
  private processString(text: string, variables: Record<string, any>, objectReferences?: Map<string, any>): string {
    return text.replace(VariableProcessor.VARIABLE_PATTERN, (_match, varRef) => {
      try {
        const reference = varRef.trim();
        const value = this.resolveVariableReference(reference, variables);
        if (
          objectReferences !== undefined &&
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value)
        ) {
          objectReferences.set(reference, value);
          return `the ${reference} reference data`;
        }
        return this.sanitiseResolvedValue(value);
      } catch (error) {
        if (error instanceof ITSVariableError) {
          throw error;
        }
        throw new ITSVariableError(`Error resolving variable reference: ${varRef}`, varRef, Object.keys(variables));
      }
    });
  }

  /**
   * Resolve a variable reference like "user.name" or "items[0]"
   */
  resolveVariableReference(varRef: string, variables: Record<string, any>): any {
    // Collection functions are a suffix chain applied after path resolution
    const { basePath, calls } = this.parseFunctionChain(varRef);

    // Validate reference syntax
    if (!this.isValidVariableReference(basePath)) {
      throw new ITSVariableError(`Invalid variable reference syntax: ${varRef}`, varRef);
    }
    if (calls.length > 0) {
      const base = this.resolvePath(basePath, variables);
      return calls.reduce((value, call) => this.applyCollectionFunction(value, call, varRef), base);
    }
    return this.resolvePath(basePath, variables);
  }

  private parseFunctionChain(varRef: string): {
    basePath: string;
    calls: Array<{ name: string; arg: string | null }>;
  } {
    const calls: Array<{ name: string; arg: string | null }> = [];
    let rest = varRef;
    const pattern = /^(.*)\.(concat|sum|avg|min|max|top)\(\s*([A-Za-z_][A-Za-z0-9_]*|\d+)?\s*\)$/;
    for (;;) {
      const match = pattern.exec(rest);
      if (!match) break;
      calls.unshift({ name: match[2], arg: match[3] ?? null });
      rest = match[1];
    }
    return { basePath: rest, calls };
  }

  private applyCollectionFunction(value: any, call: { name: string; arg: string | null }, varRef: string): any {
    if (!Array.isArray(value)) {
      throw new ITSVariableError(`Function ${call.name}() requires an array in reference '${varRef}'`, varRef);
    }
    if (call.name === 'top') {
      const count = call.arg === null ? NaN : parseInt(call.arg, 10);
      if (Number.isNaN(count) || count < 0) {
        throw new ITSVariableError(`top() requires a non-negative integer in reference '${varRef}'`, varRef);
      }
      return value.slice(0, count);
    }

    const items = value.map(item => {
      if (call.arg === null) {
        if (item !== null && typeof item === 'object') {
          throw new ITSVariableError(
            `Function ${call.name}() requires a property name for object items in reference '${varRef}'`,
            varRef
          );
        }
        return item;
      }
      if (item === null || typeof item !== 'object' || Array.isArray(item) || !(call.arg in item)) {
        throw new ITSVariableError(`Property '${call.arg}' not found on every item in reference '${varRef}'`, varRef);
      }
      return item[call.arg];
    });

    if (call.name === 'concat') {
      return items.map(item => (item === null ? 'null' : String(item))).join(', ');
    }

    const numbers = items.map(item => {
      if (typeof item !== 'number') {
        throw new ITSVariableError(`Function ${call.name}() requires numeric values in reference '${varRef}'`, varRef);
      }
      return item;
    });
    switch (call.name) {
      case 'sum':
        return numbers.reduce((total, item) => total + item, 0);
      case 'avg':
        if (numbers.length === 0) {
          throw new ITSVariableError(`avg() of an empty array in reference '${varRef}'`, varRef);
        }
        return numbers.reduce((total, item) => total + item, 0) / numbers.length;
      case 'min':
      case 'max':
        if (numbers.length === 0) {
          throw new ITSVariableError(`${call.name}() of an empty array in reference '${varRef}'`, varRef);
        }
        return call.name === 'min' ? Math.min(...numbers) : Math.max(...numbers);
      default:
        throw new ITSVariableError(`Unknown collection function '${call.name}' in reference '${varRef}'`, varRef);
    }
  }

  private resolvePath(varRef: string, variables: Record<string, any>): any {
    const parts = this.parseVariableReference(varRef);
    let current: any = variables;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (part.type === 'property') {
        // Handle special properties
        if (part.name === 'length' && (Array.isArray(current) || typeof current === 'string')) {
          return current.length;
        }

        if (typeof current !== 'object' || current === null) {
          throw new ITSVariableError(`Cannot access property '${part.name}' on non-object value`, varRef);
        }

        if (part.name && !(part.name in current)) {
          throw new ITSVariableError(
            `Property '${part.name}' not found`,
            varRef,
            typeof current === 'object' ? Object.keys(current) : []
          );
        }

        if (part.name) {
          current = current[part.name];
        }
      } else if (part.type === 'index') {
        if (!Array.isArray(current)) {
          throw new ITSVariableError(`Cannot access array index on non-array value`, varRef);
        }

        if (part.index !== undefined) {
          if (part.index < 0) {
            // Support negative indexing
            const actualIndex = current.length + part.index;
            if (actualIndex < 0 || actualIndex >= current.length) {
              throw new ITSVariableError(
                `Array index ${part.index} out of bounds for array of length ${current.length}`,
                varRef
              );
            }
            current = current[actualIndex];
          } else {
            if (part.index >= current.length) {
              throw new ITSVariableError(
                `Array index ${part.index} out of bounds for array of length ${current.length}`,
                varRef
              );
            }
            current = current[part.index];
          }
        }
      }
    }

    return current;
  }

  /**
   * Validate variable reference syntax
   */
  private isValidVariableReference(varRef: string): boolean {
    // Check for dangerous patterns
    if (varRef.includes('..') || varRef.startsWith('_') || varRef.includes('__')) {
      return false;
    }

    // Basic pattern matching for valid variable references
    const pattern = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*|\[[0-9-]+\])*$/;
    return pattern.test(varRef.replace(/\.length/g, '.length'));
  }

  /**
   * Parse variable reference into parts
   */
  private parseVariableReference(varRef: string): Array<{ type: 'property' | 'index'; name?: string; index?: number }> {
    const parts: Array<{ type: 'property' | 'index'; name?: string; index?: number }> = [];
    let current = '';
    let i = 0;

    while (i < varRef.length) {
      const char = varRef[i];

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
        while (i < varRef.length && varRef[i] !== ']') {
          indexStr += varRef[i];
          i++;
        }

        if (i >= varRef.length || varRef[i] !== ']') {
          throw new ITSVariableError(`Malformed array index in variable reference: ${varRef}`);
        }

        const index = parseInt(indexStr, 10);
        if (isNaN(index)) {
          throw new ITSVariableError(`Invalid array index: ${indexStr}`);
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
   * Sanitise resolved variable value for safe output
   */
  private sanitiseResolvedValue(value: any): string {
    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      // Convert arrays to comma-separated string
      return value.map(item => String(item)).join(', ');
    }

    if (typeof value === 'object' && value !== null) {
      // Convert objects to safe string representation
      return `[Object with ${Object.keys(value).length} properties]`;
    }

    // Convert other types to string
    const strValue = String(value);
    if (strValue.length > this.maxTextLength) {
      return strValue.substring(0, this.maxTextLength) + '... [TRUNCATED]';
    }

    return strValue;
  }

  /**
   * Find all variable references in content
   */
  findVariableReferences(content: ContentElement[]): string[] {
    const references = new Set<string>();
    const contentStr = JSON.stringify(content);

    let match;
    while ((match = VariableProcessor.VARIABLE_PATTERN.exec(contentStr)) !== null) {
      references.add(match[1].trim());
    }

    return Array.from(references);
  }

  /**
   * Validate that all variable references can be resolved
   */
  validateVariables(content: ContentElement[], variables: Record<string, any>): string[] {
    const errors: string[] = [];
    const references = this.findVariableReferences(content);

    for (const varRef of references) {
      try {
        this.resolveVariableReference(varRef, variables);
      } catch (error) {
        if (error instanceof ITSVariableError) {
          errors.push(error.message);
        } else if (error instanceof Error) {
          errors.push(`Error validating variable reference '${varRef}': ${error.message}`);
        } else {
          errors.push(`Error validating variable reference '${varRef}': ${error}`);
        }
      }
    }

    return errors;
  }
}
