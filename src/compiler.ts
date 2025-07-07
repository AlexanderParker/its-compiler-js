/**
 * Main ITS Compiler implementation
 */

import { promises as fs } from 'fs';
import { URL } from 'url';
import {
  ITSTemplate,
  ContentElement,
  CompilationOptions,
  CompilationResult,
  ValidationResult,
  InstructionTypeDefinition,
  TypeOverride,
  OverrideType,
  ITSValidationError,
  ITSCompilationError,
  SecurityConfig,
} from './types.js';
import { SecurityValidator, DEFAULT_SECURITY_CONFIG } from './security.js';
import { VariableProcessor } from './variable-processor.js';
import { ConditionalEvaluator } from './conditional-evaluator.js';
import { SchemaLoader } from './schema-loader.js';

export class ITSCompiler {
  private securityValidator: SecurityValidator;
  private variableProcessor: VariableProcessor;
  private conditionalEvaluator: ConditionalEvaluator;
  private schemaLoader: SchemaLoader;
  private securityConfig: SecurityConfig;

  constructor(securityConfig: SecurityConfig = DEFAULT_SECURITY_CONFIG) {
    this.securityConfig = securityConfig;
    this.securityValidator = new SecurityValidator(securityConfig);
    this.variableProcessor = new VariableProcessor();
    this.conditionalEvaluator = new ConditionalEvaluator(securityConfig.maxExpressionLength);
    this.schemaLoader = new SchemaLoader(3600000, securityConfig, securityConfig.requestTimeout);
  }

  /**
   * Compile a template from file
   */
  async compileFile(
    templatePath: string,
    variables?: Record<string, any>,
    options?: CompilationOptions
  ): Promise<CompilationResult> {
    try {
      const templateContent = await fs.readFile(templatePath, 'utf-8');
      const template = JSON.parse(templateContent);

      // Set base URL for relative schema references
      const baseUrl = this.getBaseUrlFromPath(templatePath);

      return await this.compile(template, variables, { ...options, baseUrl });
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ITSCompilationError(
          `Invalid JSON in template file: ${error.message}`,
          undefined,
          undefined,
          'file_parsing'
        );
      }
      throw new ITSCompilationError(`Failed to load template file: ${error}`, undefined, undefined, 'file_loading');
    }
  }

  /**
   * Compile a template
   */
  async compile(
    template: ITSTemplate,
    variables?: Record<string, any>,
    options?: CompilationOptions
  ): Promise<CompilationResult> {
    const startTime = Date.now();
    const mergedOptions = { ...options };

    try {
      // Security validation
      this.securityValidator.validateTemplate(template);

      // Validate template structure
      const validationResult = await this.validate(template, mergedOptions.baseUrl);
      if (!validationResult.isValid) {
        throw new ITSValidationError(
          'Template validation failed',
          undefined,
          validationResult.errors,
          validationResult.securityIssues
        );
      }

      // Merge template variables with provided variables
      const templateVariables = template.variables || {};
      const mergedVariables = { ...templateVariables, ...(variables || {}) };

      // Load and resolve instruction types
      const { instructionTypes, overrides } = await this.loadInstructionTypes(template, mergedOptions.baseUrl);

      // Process variables in content
      const processedContent = this.variableProcessor.processContent(template.content, mergedVariables);

      // Evaluate conditionals
      const finalContent = this.conditionalEvaluator.evaluateContent(processedContent, mergedVariables);

      // Generate final prompt
      const prompt = this.generatePrompt(finalContent, instructionTypes, template);

      const compilationTime = Date.now() - startTime;

      return {
        prompt,
        template,
        variables: mergedVariables,
        overrides,
        warnings: validationResult.warnings,
        compilationTime,
      };
    } catch (error) {
      if (error instanceof ITSValidationError || error instanceof ITSCompilationError) {
        throw error;
      }
      throw new ITSCompilationError(`Compilation failed: ${error}`, undefined, undefined, 'compilation');
    }
  }

  /**
   * Validate a template
   */
  async validate(template: ITSTemplate, baseUrl?: string): Promise<ValidationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const securityIssues: string[] = [];

    try {
      // Security validation
      this.securityValidator.validateTemplate(template);
    } catch (error) {
      if (error instanceof Error) {
        securityIssues.push(error.message);
      }
    }

    // Required fields
    if (!template.version) {
      errors.push('Missing required field: version');
    }
    if (!template.content) {
      errors.push('Missing required field: content');
    } else if (!Array.isArray(template.content)) {
      errors.push("Field 'content' must be an array");
    } else if (template.content.length === 0) {
      errors.push("Field 'content' cannot be empty");
    }

    // Validate content elements
    if (template.content && Array.isArray(template.content)) {
      const contentErrors = this.validateContent(template.content);
      errors.push(...contentErrors);
    }

    // Try to load schemas
    try {
      await this.loadInstructionTypes(template, baseUrl);
    } catch (error) {
      if (error instanceof Error) {
        errors.push(`Schema loading error: ${error.message}`);
      }
    }

    // Validate variables
    const templateVariables = template.variables || {};
    if (template.content) {
      const varErrors = this.variableProcessor.validateVariables(template.content, templateVariables);
      errors.push(...varErrors);
    }

    const validationTime = Date.now() - startTime;

    return {
      isValid: errors.length === 0 && securityIssues.length === 0,
      errors,
      warnings,
      securityIssues,
      validationTime,
    };
  }

  /**
   * Validate content elements
   */
  private validateContent(content: ContentElement[]): string[] {
    const errors: string[] = [];

    for (let i = 0; i < content.length; i++) {
      const element = content[i];

      if (!element.type) {
        errors.push(`Content element ${i} missing required field: type`);
        continue;
      }

      if (element.type === 'text') {
        const textElement = element as any;
        if (!textElement.text) {
          errors.push(`Text element ${i} missing required field: text`);
        }
      } else if (element.type === 'placeholder') {
        const placeholderElement = element as any;
        if (!placeholderElement.instructionType) {
          errors.push(`Placeholder element ${i} missing required field: instructionType`);
        }
        if (!placeholderElement.config) {
          errors.push(`Placeholder element ${i} missing required field: config`);
        } else if (typeof placeholderElement.config !== 'object') {
          errors.push(`Placeholder element ${i} config must be an object`);
        } else if (!placeholderElement.config.description) {
          errors.push(`Placeholder element ${i} config missing required field: description`);
        }
      } else if (element.type === 'conditional') {
        const conditionalElement = element as any;
        if (!conditionalElement.condition) {
          errors.push(`Conditional element ${i} missing required field: condition`);
        }
        if (!conditionalElement.content) {
          errors.push(`Conditional element ${i} missing required field: content`);
        } else if (!Array.isArray(conditionalElement.content)) {
          errors.push(`Conditional element ${i} content must be an array`);
        } else {
          const nestedErrors = this.validateContent(conditionalElement.content);
          errors.push(...nestedErrors);
        }

        if (conditionalElement.else) {
          if (!Array.isArray(conditionalElement.else)) {
            errors.push(`Conditional element ${i} else must be an array`);
          } else {
            const elseErrors = this.validateContent(conditionalElement.else);
            errors.push(...elseErrors);
          }
        }
      } else {
        errors.push(`Content element ${i} has invalid type: ${element.type}`);
      }
    }

    return errors;
  }

  /**
   * Load and resolve instruction types from schemas
   */
  private async loadInstructionTypes(
    template: ITSTemplate,
    baseUrl?: string
  ): Promise<{ instructionTypes: Record<string, InstructionTypeDefinition>; overrides: TypeOverride[] }> {
    const instructionTypes: Record<string, InstructionTypeDefinition> = {};
    const overrides: TypeOverride[] = [];

    // Load extended schemas in order
    const extends_ = template.extends || [];
    for (const schemaUrl of extends_) {
      const schema = await this.schemaLoader.loadSchema(schemaUrl, baseUrl);
      const schemaTypes = schema.instructionTypes || {};

      // Check for overrides
      for (const [typeName, typeDef] of Object.entries(schemaTypes)) {
        if (typeName in instructionTypes) {
          overrides.push({
            typeName,
            overrideSource: schemaUrl,
            overriddenSource: instructionTypes[typeName].source || 'unknown',
            overrideType: OverrideType.SCHEMA_EXTENSION,
          });
        }

        const typeDefAny = typeDef as any;
        const instructionTypeDef: InstructionTypeDefinition = {
          template: typeDefAny.template,
          source: schemaUrl,
        };

        if (typeDefAny.description !== undefined) {
          instructionTypeDef.description = typeDefAny.description;
        }

        if (typeDefAny.configSchema !== undefined) {
          instructionTypeDef.configSchema = typeDefAny.configSchema;
        }

        instructionTypes[typeName] = instructionTypeDef;
      }
    }

    // Apply custom instruction types (highest precedence)
    const customTypes = template.customInstructionTypes || {};
    for (const [typeName, typeDef] of Object.entries(customTypes)) {
      if (typeName in instructionTypes) {
        overrides.push({
          typeName,
          overrideSource: 'customInstructionTypes',
          overriddenSource: instructionTypes[typeName].source || 'unknown',
          overrideType: OverrideType.CUSTOM,
        });
      }

      const customTypeDef: InstructionTypeDefinition = {
        template: typeDef.template,
        source: 'custom',
      };

      if (typeDef.description !== undefined) {
        customTypeDef.description = typeDef.description;
      }

      if (typeDef.configSchema !== undefined) {
        customTypeDef.configSchema = typeDef.configSchema;
      }

      instructionTypes[typeName] = customTypeDef;
    }

    return { instructionTypes, overrides };
  }

  /**
   * Generate the final AI prompt
   */
  private generatePrompt(
    content: ContentElement[],
    instructionTypes: Record<string, InstructionTypeDefinition>,
    template: ITSTemplate
  ): string {
    // Get compiler configuration
    const compilerConfig = template.compilerConfig || {};
    const systemPrompt = compilerConfig.systemPrompt || this.getDefaultSystemPrompt();
    const instructionWrapper = compilerConfig.instructionWrapper || '<<{instruction}>>';
    const processingInstructions = compilerConfig.processingInstructions || this.getDefaultProcessingInstructions();

    // Process content elements
    const processedContent: string[] = [];

    for (const element of content) {
      if (element.type === 'text') {
        processedContent.push((element as any).text);
      } else if (element.type === 'placeholder') {
        const placeholderElement = element as any;
        const instruction = this.generateInstruction(placeholderElement, instructionTypes);

        // Check if the instruction already has wrapper brackets
        if (instruction.startsWith('<<') && instruction.endsWith('>>')) {
          processedContent.push(instruction);
        } else {
          const wrappedInstruction = instructionWrapper.replace('{instruction}', instruction);
          processedContent.push(wrappedInstruction);
        }
      }
    }

    // Assemble final prompt
    const promptParts = ['INTRODUCTION', '', systemPrompt, '', 'INSTRUCTIONS', ''];

    processingInstructions.forEach((instruction: string, i: number) => {
      promptParts.push(`${i + 1}. ${instruction}`);
    });

    promptParts.push('', 'TEMPLATE', '', processedContent.join(''));

    return promptParts.join('\n');
  }

  /**
   * Generate an instruction for a placeholder
   */
  private generateInstruction(placeholder: any, instructionTypes: Record<string, InstructionTypeDefinition>): string {
    const instructionTypeName = placeholder.instructionType;
    const config = placeholder.config;

    if (!(instructionTypeName in instructionTypes)) {
      const availableTypes = Object.keys(instructionTypes);
      throw new ITSCompilationError(
        `Unknown instruction type: '${instructionTypeName}'`,
        placeholder.id,
        instructionTypeName,
        'instruction_generation',
        { availableTypes }
      );
    }

    const instructionType = instructionTypes[instructionTypeName];

    try {
      return this.formatInstruction(instructionType, config);
    } catch (error) {
      throw new ITSCompilationError(
        `Missing required configuration for instruction type '${instructionTypeName}': ${error}`,
        placeholder.id,
        instructionTypeName,
        'instruction_generation'
      );
    }
  }

  /**
   * Format an instruction template with config values
   */
  private formatInstruction(instructionType: InstructionTypeDefinition, config: any): string {
    const description = config.description || '';

    // Start with the template
    let formattedTemplate = instructionType.template;

    // Replace description placeholder
    formattedTemplate = formattedTemplate.replace(/\{description\}/g, description);

    // Replace other config placeholders
    for (const [key, value] of Object.entries(config)) {
      if (key !== 'description') {
        const placeholder = `{${key}}`;
        formattedTemplate = formattedTemplate.replace(
          new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          String(value)
        );
      }
    }

    return formattedTemplate;
  }

  /**
   * Get base URL from file path
   */
  private getBaseUrlFromPath(filePath: string): string {
    try {
      const url = new URL(`file://${filePath}`);
      const pathParts = url.pathname.split('/');
      pathParts.pop(); // Remove filename
      return url.protocol + '//' + pathParts.join('/') + '/';
    } catch {
      return '';
    }
  }

  /**
   * Get default system prompt
   */
  private getDefaultSystemPrompt(): string {
    return (
      'You are an AI assistant that fills in content templates. ' +
      'Follow the instructions exactly and replace each placeholder with ' +
      'appropriate content based on the user prompts provided. ' +
      'Respond only with the transformed content.'
    );
  }

  /**
   * Get default processing instructions
   */
  private getDefaultProcessingInstructions(): string[] {
    return [
      'Replace each placeholder marked with << >> with generated content',
      "The user's content request is wrapped in ([{< >}]) to distinguish it from instructions",
      'Follow the format requirements specified after each user prompt',
      'Maintain the existing structure and formatting of the template',
      'Only replace the placeholders - do not modify any other text',
      'Generate content that matches the tone and style requested',
      'Respond only with the transformed content - do not include any explanations or additional text',
    ];
  }

  /**
   * Clear schema cache
   */
  clearCache(): void {
    this.schemaLoader.clearCache();
  }

  /**
   * Get security status
   */
  getSecurityStatus(): any {
    return {
      securityEnabled: true,
      config: this.securityConfig,
      cache: this.schemaLoader.getCacheStats(),
    };
  }
}
