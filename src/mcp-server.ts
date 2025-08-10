#!/usr/bin/env node

/**
 * Model Context Protocol (MCP) Server for ITS Compiler
 * Simple implementation without external dependencies
 */

import { promises as fs } from 'fs';
import { ITSCompiler } from './compiler.js';
import { DEFAULT_SECURITY_CONFIG } from './security.js';
import { ITSValidationError, ITSCompilationError, ITSSecurityError, SecurityConfig } from './types.js';

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface CompileToolArgs {
  template: string | object;
  variables?: Record<string, any>;
  options?: {
    baseUrl?: string;
    allowHttp?: boolean;
    timeout?: number;
    strict?: boolean;
  };
}

interface ValidateToolArgs {
  template: string | object;
  baseUrl?: string;
}

interface CompileFileToolArgs {
  templatePath: string;
  variables?: Record<string, any>;
  options?: {
    allowHttp?: boolean;
    timeout?: number;
    strict?: boolean;
  };
}

interface GetSchemaToolArgs {
  schemaType: 'base' | 'standard-types';
}

class ITSMCPServer {
  private compiler: ITSCompiler;

  constructor() {
    this.compiler = new ITSCompiler();
  }

  private createSecurityConfig(options: any = {}): SecurityConfig {
    const config: SecurityConfig = {
      ...DEFAULT_SECURITY_CONFIG,
    };

    if (options.allowHttp) {
      config.allowHttp = true;
    }

    if (options.timeout) {
      config.requestTimeout = options.timeout * 1000;
    }

    if (options.strict) {
      config.maxTemplateSize = 512 * 1024; // 512KB
      config.maxContentElements = 500;
      config.maxNestingDepth = 8;
    }

    return config;
  }

  private async handleCompile(args: CompileToolArgs): Promise<any> {
    const { template, variables = {}, options = {} } = args;

    // Parse template if it's a string
    let templateObj;
    if (typeof template === 'string') {
      try {
        templateObj = JSON.parse(template);
      } catch (error) {
        throw new Error(`Invalid JSON template: ${error}`);
      }
    } else {
      templateObj = template;
    }

    // Create security config based on options
    const securityConfig = this.createSecurityConfig(options);
    const compiler = new ITSCompiler(securityConfig);

    // Compile the template
    const compilationOptions: any = {};
    if (options.baseUrl) {
      compilationOptions.baseUrl = options.baseUrl;
    }

    const result = await compiler.compile(templateObj, variables, compilationOptions);

    return {
      success: true,
      prompt: result.prompt,
      warnings: result.warnings,
      overrides: result.overrides,
      compilationTime: result.compilationTime,
      variables: result.variables,
    };
  }

  private async handleCompileFile(args: CompileFileToolArgs): Promise<any> {
    const { templatePath, variables = {}, options = {} } = args;

    // Check if file exists
    try {
      await fs.access(templatePath);
    } catch (error) {
      throw new Error(`Template file not found: ${templatePath}`);
    }

    // Create security config based on options
    const securityConfig = this.createSecurityConfig(options);
    const compiler = new ITSCompiler(securityConfig);

    // Compile the template file
    const result = await compiler.compileFile(templatePath, variables);

    return {
      success: true,
      prompt: result.prompt,
      warnings: result.warnings,
      overrides: result.overrides,
      compilationTime: result.compilationTime,
      variables: result.variables,
    };
  }

  private async handleValidate(args: ValidateToolArgs): Promise<any> {
    const { template, baseUrl } = args;

    // Parse template if it's a string
    let templateObj;
    if (typeof template === 'string') {
      try {
        templateObj = JSON.parse(template);
      } catch (error) {
        throw new Error(`Invalid JSON template: ${error}`);
      }
    } else {
      templateObj = template;
    }

    // Validate the template
    const result = await this.compiler.validate(templateObj, baseUrl);

    return {
      success: true,
      isValid: result.isValid,
      errors: result.errors,
      warnings: result.warnings,
      securityIssues: result.securityIssues,
      validationTime: result.validationTime,
    };
  }

  private async handleGetSchema(args: GetSchemaToolArgs): Promise<any> {
    const { schemaType } = args;

    try {
      let schemaPath: string;
      if (schemaType === 'base') {
        schemaPath = './schemas/v1.0/its-base-schema-v1.json';
      } else if (schemaType === 'standard-types') {
        schemaPath = './schemas/v1.0/its-standard-types-v1.json';
      } else {
        throw new Error(`Unknown schema type: ${schemaType}`);
      }

      // Read schema file
      const schemaContent = await fs.readFile(schemaPath, 'utf-8');
      const schema = JSON.parse(schemaContent);

      return {
        success: true,
        schemaType,
        schema,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        throw new Error(
          `Schema file not found at: ${schemaType === 'base' ? './schemas/v1.0/its-base-schema-v1.json' : './schemas/v1.0/its-standard-types-v1.json'}`
        );
      }
      throw new Error(`Failed to load schema: ${error}`);
    }
  }

  private async handleGetExample(): Promise<any> {
    try {
      // Read the sample template from dist directory
      const templatePath = './sample/sample-template.json';
      const outputPath = './sample/sample-template-output.txt';

      const templateContent = await fs.readFile(templatePath, 'utf-8');
      const outputContent = await fs.readFile(outputPath, 'utf-8');

      const template = JSON.parse(templateContent);

      return {
        success: true,
        description: 'Example ITS template showing standard instruction types for product marketing copy',
        template,
        compiledOutput: outputContent,
        instructionTypesUsed: ['paragraph', 'list', 'table'],
        features: [
          'Variable substitution with ${variable} syntax',
          'Conditional content based on variables',
          'Standard instruction types (paragraph, list, table)',
          'Custom compiler configuration',
          'Nested object and array variable access',
        ],
      };
    } catch (error) {
      throw new Error(`Failed to load example template: ${error}`);
    }
  }

  private async handleToolCall(name: string, args: any): Promise<any> {
    try {
      switch (name) {
        case 'its_compile':
          return await this.handleCompile(args as CompileToolArgs);
        case 'its_compile_file':
          return await this.handleCompileFile(args as CompileFileToolArgs);
        case 'its_validate':
          return await this.handleValidate(args as ValidateToolArgs);
        case 'its_get_schema':
          return await this.handleGetSchema(args as GetSchemaToolArgs);
        case 'its_get_example':
          return await this.handleGetExample();
        default:
          throw new Error(`Tool ${name} not found`);
      }
    } catch (error) {
      let errorMessage = 'Unknown error occurred';

      if (error instanceof ITSValidationError) {
        errorMessage = `Validation failed: ${error.message}`;
        if (error.validationErrors.length > 0) {
          errorMessage += `\nErrors: ${error.validationErrors.join(', ')}`;
        }
        if (error.securityIssues.length > 0) {
          errorMessage += `\nSecurity issues: ${error.securityIssues.join(', ')}`;
        }
      } else if (error instanceof ITSCompilationError) {
        errorMessage = `Compilation failed: ${error.message}`;
      } else if (error instanceof ITSSecurityError) {
        errorMessage = `Security error: ${error.message}`;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      throw new Error(errorMessage);
    }
  }

  private sendResponse(response: MCPResponse): void {
    console.log(JSON.stringify(response));
  }

  private sendError(id: string | number, code: number, message: string, data?: any): void {
    this.sendResponse({
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data,
      },
    });
  }

  private async handleRequest(request: MCPRequest): Promise<void> {
    try {
      if (request.method === 'tools/list') {
        this.sendResponse({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            tools: [
              {
                name: 'its_compile',
                description:
                  'Compile ITS (Instruction Template Specification) templates - JSON files that define reusable content structures with placeholders, variables (${var}), and conditionals. When compiled, they become structured AI prompts that generate consistent content. Templates use instruction types like paragraph, list, table, code_block, dialogue, etc. **Use its_get_example for format and its_get_schema for all available instruction types.** Perfect for creating reusable content templates.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    template: {
                      oneOf: [
                        { type: 'string', description: 'JSON string of the template' },
                        { type: 'object', description: 'Template object' },
                      ],
                      description: 'The ITS template to compile',
                    },
                    variables: {
                      type: 'object',
                      description:
                        'Variables to substitute in the template. Note: if template is passed as an object, variables can be provided here OR in template.variables (this parameter takes precedence).',
                      additionalProperties: true,
                    },
                    options: {
                      type: 'object',
                      properties: {
                        baseUrl: {
                          type: 'string',
                          description: 'Base URL for resolving relative schema references',
                        },
                        allowHttp: {
                          type: 'boolean',
                          description: 'Allow HTTP URLs (default: false)',
                          default: false,
                        },
                        timeout: {
                          type: 'number',
                          description: 'Network timeout in seconds',
                          default: 10,
                        },
                        strict: {
                          type: 'boolean',
                          description: 'Enable strict validation mode',
                          default: false,
                        },
                      },
                      additionalProperties: false,
                    },
                  },
                  required: ['template'],
                  additionalProperties: false,
                },
              },
              {
                name: 'its_compile_file',
                description:
                  'Compile an ITS template file (.json) into a structured AI prompt. ITS templates are JSON structures that define reusable content formats - they compile into AI prompts that generate consistent content. Templates use instruction types like paragraph, list, table, etc. **Use its_get_example and its_get_schema first to understand format and available types.**',
                inputSchema: {
                  type: 'object',
                  properties: {
                    templatePath: {
                      type: 'string',
                      description: 'Path to the ITS template JSON file',
                    },
                    variables: {
                      type: 'object',
                      description: 'Variables to substitute in the template',
                      additionalProperties: true,
                    },
                    options: {
                      type: 'object',
                      properties: {
                        allowHttp: {
                          type: 'boolean',
                          description: 'Allow HTTP URLs (default: false)',
                          default: false,
                        },
                        timeout: {
                          type: 'number',
                          description: 'Network timeout in seconds',
                          default: 10,
                        },
                        strict: {
                          type: 'boolean',
                          description: 'Enable strict validation mode',
                          default: false,
                        },
                      },
                      additionalProperties: false,
                    },
                  },
                  required: ['templatePath'],
                  additionalProperties: false,
                },
              },
              {
                name: 'its_validate',
                description:
                  'Validate an ITS template structure without compiling. **Use its_get_example for format and its_get_schema for type definitions.** Checks syntax, required fields, variable references, security issues, and schema compliance.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    template: {
                      oneOf: [
                        { type: 'string', description: 'JSON string of the template' },
                        { type: 'object', description: 'Template object' },
                      ],
                      description: 'The ITS template to validate',
                    },
                    baseUrl: {
                      type: 'string',
                      description: 'Base URL for resolving relative schema references',
                    },
                  },
                  required: ['template'],
                  additionalProperties: false,
                },
              },
              {
                name: 'its_get_example',
                description:
                  'Get a complete example ITS template with compiled output. ITS templates are JSON structures that define reusable content formats - they compile into AI prompts that generate consistent content. Shows standard instruction types (paragraph, list, table), variables, conditionals, and proper template structure. **Start here to understand the format.**',
                inputSchema: {
                  type: 'object',
                  properties: {},
                  additionalProperties: false,
                },
              },
              {
                name: 'its_get_schema',
                description:
                  'Get ITS schema definitions. Use "base" for template structure or "standard-types" for instruction types: paragraph, list, table, title, code_block, image_description, dialogue, quote, summary. **Essential for understanding available placeholder types before creating templates.**',
                inputSchema: {
                  type: 'object',
                  properties: {
                    schemaType: {
                      type: 'string',
                      enum: ['base', 'standard-types'],
                      description: 'Type of schema to retrieve',
                    },
                  },
                  required: ['schemaType'],
                  additionalProperties: false,
                },
              },
            ],
          },
        });
      } else if (request.method === 'tools/call') {
        const { name, arguments: args } = request.params;
        const result = await this.handleToolCall(name, args);

        this.sendResponse({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
        });
      } else if (request.method === 'initialize') {
        this.sendResponse({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'its-compiler',
              version: '1.0.0',
            },
          },
        });
      } else {
        this.sendError(request.id, -32601, `Method not found: ${request.method}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.sendError(request.id, -32603, message);
    }
  }

  async run(): Promise<void> {
    process.stdin.setEncoding('utf8');

    let buffer = '';

    process.stdin.on('data', (chunk: string) => {
      buffer += chunk;

      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line) {
          try {
            const request = JSON.parse(line) as MCPRequest;
            this.handleRequest(request);
          } catch (error) {
            process.stderr.write(`Error parsing JSON: ${error}\n`);
          }
        }
      }
    });

    process.stdin.on('end', () => {
      process.exit(0);
    });

    process.stderr.write('ITS Compiler MCP server started\n');
  }
}

// Start the server if this file is run directly
const isMainModule =
  process.argv[1] && (process.argv[1].endsWith('mcp-server.js') || process.argv[1].includes('mcp-server'));

if (isMainModule) {
  const server = new ITSMCPServer();
  server.run().catch(error => {
    process.stderr.write(`Fatal error in MCP server: ${error}\n`);
    process.exit(1);
  });
}

export { ITSMCPServer };
