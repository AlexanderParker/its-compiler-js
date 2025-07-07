/**
 * Variable processing and substitution for ITS Compiler
 */

import { ITSVariableError, ContentElement, TextElement, PlaceholderElement, ConditionalElement } from './types.js';

export class VariableProcessor {
  private static VARIABLE_PATTERN = /\$\{([^}]+)\}/g;

  /**
   * Process variable references in content elements
   */
  processContent(content: ContentElement[], variables: Record<string, any>): ContentElement[] {
    return content.map(element => this.processElement(element, variables));
  }

  /**
   * Process variables in a single content element
   */
  private processElement(element: ContentElement, variables: Record<string, any>): ContentElement {
    if (element.type === 'text') {
      const textElement = element as TextElement;
      return {
        ...element,
        text: this.processString(textElement.text, variables),
      } as TextElement;
    }

    if (element.type === 'placeholder') {
      const placeholderElement = element as PlaceholderElement;
      return {
        ...element,
        config: this.processObject(placeholderElement.config, variables),
      } as PlaceholderElement;
    }

    if (element.type === 'conditional') {
      const conditionalElement = element as ConditionalElement;
      return {
        ...element,
        condition: this.processString(conditionalElement.condition, variables),
        content: this.processContent(conditionalElement.content, variables),
        else: conditionalElement.else ? this.processContent(conditionalElement.else, variables) : undefined,
      } as ConditionalElement;
    }

    return element;
  }

  /**
   * Process variables in an object
   */
  private processObject(obj: any, variables: Record<string, any>): any {
    if (typeof obj === 'string') {
      return this.processString(obj, variables);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.processObject(item, variables));
    }

    if (typeof obj === 'object' && obj !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.processObject(value, variables);
      }
      return result;
    }

    return obj;
  }

  /**
   * Process variable references in a string
   */
  private processString(text: string, variables: Record<string, any>): string {
    return text.replace(VariableProcessor.VARIABLE_PATTERN, (_match, varRef) => {
      try {
        const value = this.resolveVariableReference(varRef.trim(), variables);
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
    // Validate reference syntax
    if (!this.isValidVariableReference(varRef)) {
      throw new ITSVariableError(`Invalid variable reference syntax: ${varRef}`, varRef);
    }

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
    if (strValue.length > 1000) {
      return strValue.substring(0, 1000) + '... [TRUNCATED]';
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
