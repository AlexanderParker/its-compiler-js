/**
 * Type definitions for ITS Compiler
 */

export interface ITSTemplate {
  $schema?: string;
  version: string;
  description?: string;
  extends?: string[];
  variables?: Record<string, any>;
  customInstructionTypes?: Record<string, InstructionTypeDefinition>;
  content: ContentElement[];
  compilerConfig?: CompilerConfig;
}

export interface ContentElement {
  type: 'text' | 'placeholder' | 'conditional';
  id?: string;
}

export interface TextElement extends ContentElement {
  type: 'text';
  text: string;
}

export interface PlaceholderElement extends ContentElement {
  type: 'placeholder';
  instructionType: string;
  config: PlaceholderConfig;
}

export interface ConditionalElement extends ContentElement {
  type: 'conditional';
  condition: string;
  content: ContentElement[];
  else?: ContentElement[];
}

export interface PlaceholderConfig {
  description: string;
  [key: string]: any;
}

export interface InstructionTypeDefinition {
  template: string;
  description?: string;
  configSchema?: Record<string, any>;
  source?: string;
}

export interface CompilerConfig {
  systemPrompt?: string;
  userContentWrapper?: string;
  instructionWrapper?: string;
  processingInstructions?: string[];
}

export interface CompilationOptions {
  variables?: Record<string, any>;
  baseUrl?: string;
  allowHttp?: boolean;
  maxSchemaSize?: number;
  timeout?: number;
  cache?: boolean;
  strict?: boolean;
}

export interface CompilationResult {
  prompt: string;
  template: ITSTemplate;
  variables: Record<string, any>;
  overrides: TypeOverride[];
  warnings: string[];
  compilationTime?: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  securityIssues: string[];
  validationTime?: number;
}

export interface TypeOverride {
  typeName: string;
  overrideSource: string;
  overriddenSource: string;
  overrideType: OverrideType;
}

export enum OverrideType {
  CUSTOM = 'custom',
  SCHEMA_EXTENSION = 'schema',
  STANDARD = 'standard',
}

export interface SecurityConfig {
  allowHttp: boolean;
  blockLocalhost: boolean;
  blockPrivateNetworks: boolean;
  domainAllowlist?: string[];
  maxTemplateSize: number;
  maxContentElements: number;
  maxNestingDepth: number;
  maxExpressionLength: number;
  requestTimeout: number;
}

export interface SchemaCache {
  [url: string]: {
    schema: any;
    cachedAt: number;
    expiresAt: number;
  };
}

export class ITSError extends Error {
  public details?: Record<string, any>;
  public errorCode?: string;

  constructor(message: string, details?: Record<string, any>, errorCode?: string) {
    super(message);
    this.name = this.constructor.name;
    if (details !== undefined) this.details = details;
    if (errorCode !== undefined) this.errorCode = errorCode;
  }
}

export class ITSValidationError extends ITSError {
  public path?: string;
  public validationErrors: string[];
  public securityIssues: string[];

  constructor(
    message: string,
    path?: string,
    validationErrors: string[] = [],
    securityIssues: string[] = [],
    details?: Record<string, any>
  ) {
    super(message, details, 'VALIDATION_FAILED');
    if (path !== undefined) this.path = path;
    this.validationErrors = validationErrors;
    this.securityIssues = securityIssues;
  }
}

export class ITSCompilationError extends ITSError {
  public elementId?: string;
  public elementType?: string;
  public compilationStage?: string;

  constructor(
    message: string,
    elementId?: string,
    elementType?: string,
    compilationStage?: string,
    details?: Record<string, any>
  ) {
    super(message, details, 'COMPILATION_FAILED');
    if (elementId !== undefined) this.elementId = elementId;
    if (elementType !== undefined) this.elementType = elementType;
    if (compilationStage !== undefined) this.compilationStage = compilationStage;
  }
}

export class ITSSecurityError extends ITSError {
  public securityRule?: string;
  public threatType?: string;
  public blockedContent?: string;

  constructor(
    message: string,
    securityRule?: string,
    threatType?: string,
    blockedContent?: string,
    details?: Record<string, any>
  ) {
    super(message, details, 'SECURITY_VIOLATION');
    if (securityRule !== undefined) this.securityRule = securityRule;
    if (threatType !== undefined) this.threatType = threatType;
    if (blockedContent !== undefined) this.blockedContent = blockedContent;
  }
}

export class ITSVariableError extends ITSError {
  public variablePath?: string;
  public availableVariables?: string[];

  constructor(message: string, variablePath?: string, availableVariables?: string[], details?: Record<string, any>) {
    super(message, details, 'VARIABLE_ERROR');
    if (variablePath !== undefined) this.variablePath = variablePath;
    if (availableVariables !== undefined) this.availableVariables = availableVariables;
  }
}
