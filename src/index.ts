/**
 * ITS Compiler - JavaScript/TypeScript implementation
 *
 * Reference implementation of the Instruction Template Specification (ITS) compiler
 * that converts content templates with placeholders into structured AI prompts.
 */

import { ITSCompiler } from './compiler.js';
export { ITSCompiler } from './compiler.js';
export { SecurityValidator, DEFAULT_SECURITY_CONFIG, DEVELOPMENT_SECURITY_CONFIG } from './security.js';
export { VariableProcessor } from './variable-processor.js';
export { ConditionalEvaluator } from './conditional-evaluator.js';
export { SchemaLoader } from './schema-loader.js';

// Export all types
export type {
  ITSTemplate,
  ContentElement,
  TextElement,
  PlaceholderElement,
  ConditionalElement,
  PlaceholderConfig,
  InstructionTypeDefinition,
  CompilerConfig,
  CompilationOptions,
  CompilationResult,
  ValidationResult,
  TypeOverride,
  SecurityConfig,
  SchemaCache,
} from './types.js';

export {
  OverrideType,
  ITSError,
  ITSValidationError,
  ITSCompilationError,
  ITSSecurityError,
  ITSVariableError,
} from './types.js';

// Default export for convenience
export { ITSCompiler as default } from './compiler.js';

/**
 * Package version
 */
export const VERSION = '1.0.0';

/**
 * Create a new ITS Compiler instance with default configuration
 */
export function createCompiler(securityConfig?: any) {
  return new ITSCompiler(securityConfig);
}

/**
 * Compile a template file with default settings
 */
export async function compileFile(templatePath: string, variables?: Record<string, any>, options?: any) {
  const compiler = new ITSCompiler();
  return await compiler.compileFile(templatePath, variables, options);
}

/**
 * Compile a template object with default settings
 */
export async function compile(template: any, variables?: Record<string, any>, options?: any) {
  const compiler = new ITSCompiler();
  return await compiler.compile(template, variables, options);
}

/**
 * Validate a template with default settings
 */
export async function validate(template: any, baseUrl?: string) {
  const compiler = new ITSCompiler();
  return await compiler.validate(template, baseUrl);
}
