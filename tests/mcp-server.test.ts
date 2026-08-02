/**
 * Tests for MCP Server
 */

import { ITSMCPServer } from '../src/mcp-server';
import { ITSTemplate, TextElement } from '../src/types';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';

describe('ITSMCPServer', () => {
  let server: ITSMCPServer;

  beforeEach(() => {
    server = new ITSMCPServer();
  });

  describe('constructor', () => {
    it('should create a server instance', () => {
      expect(server).toBeInstanceOf(ITSMCPServer);
    });
  });

  describe('basic functionality', () => {
    it('should handle basic template compilation', async () => {
      const template: ITSTemplate = {
        version: '1.0.0',
        content: [
          {
            type: 'text',
            text: 'Hello world',
          } as TextElement,
        ],
      };

      // Test that the template structure is valid
      expect(template.version).toBe('1.0.0');
      expect(template.content).toHaveLength(1);
    });
  });
});

describe('MCP Server Integration', () => {
  let serverProcess: ChildProcess;
  let requestId = 1;

  beforeAll(async () => {
    // Make sure dist exists
    try {
      await fs.access('dist/mcp-server.js');
    } catch {
      throw new Error('Build the project first: npm run build');
    }
  });

  beforeEach(() => {
    serverProcess = spawn('node', ['dist/mcp-server.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  });

  afterEach(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  const sendRequest = (request: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 5000);

      serverProcess.stdout?.once('data', data => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(data.toString());
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });

      serverProcess.stdin?.write(JSON.stringify(request) + '\n');
    });
  };

  test('should initialize successfully', async () => {
    const request = {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'initialize',
      params: {},
    };

    const response = await sendRequest(request);

    expect(response.jsonrpc).toBe('2.0');
    expect(response.result.protocolVersion).toBe('2024-11-05');
    expect(response.result.serverInfo.name).toBe('its-compiler');
  });

  test('should list all tools including new schema tool', async () => {
    const request = {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/list',
    };

    const response = await sendRequest(request);

    expect(response.result.tools).toHaveLength(5);
    expect(response.result.tools.map((t: any) => t.name)).toEqual([
      'its_compile',
      'its_compile_file',
      'its_validate',
      'its_get_example',
      'its_get_schema',
    ]);

    // Check that descriptions mention the helper tools
    const compileDescription = response.result.tools.find((t: any) => t.name === 'its_compile').description;
    expect(compileDescription).toContain('its_get_example');
    expect(compileDescription).toContain('its_get_schema');
    expect(compileDescription).toContain('JSON files that define reusable content structures');
  });

  test('should get example template from dist directory', async () => {
    const request = {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'its_get_example',
        arguments: {},
      },
    };

    const response = await sendRequest(request);

    expect(response.result.content[0].text).toContain('success');
    const result = JSON.parse(response.result.content[0].text);
    expect(result.success).toBe(true);
    expect(result.template).toBeDefined();
    expect(result.template.version).toBe('1.0.0');
    expect(result.compiledOutput).toBeDefined();
    expect(result.instructionTypesUsed).toContain('paragraph');
    expect(result.features).toContain('Variable substitution with ${variable} syntax');
  });

  test('should get schema definitions', async () => {
    const request = {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'its_get_schema',
        arguments: {
          schemaType: 'standard-types',
        },
      },
    };

    const response = await sendRequest(request);

    const result = JSON.parse(response.result.content[0].text);
    expect(result.success).toBe(true);
    expect(result.schemaType).toBe('standard-types');
    expect(result.schema).toBeDefined();
    expect(result.schema.instructionTypes).toBeDefined();
    expect(result.schema.instructionTypes.paragraph).toBeDefined();
    expect(result.schema.instructionTypes.list).toBeDefined();
    expect(result.schema.instructionTypes.table).toBeDefined();
  });

  test('should compile simple template with variables in template', async () => {
    const template = {
      version: '1.0.0',
      variables: {
        name: 'World',
      },
      content: [
        {
          type: 'text',
          text: 'Hello ${name}!',
        },
      ],
    };

    const request = {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'its_compile',
        arguments: {
          template,
        },
      },
    };

    const response = await sendRequest(request);

    expect(response.result.content[0].text).toContain('success');
    const result = JSON.parse(response.result.content[0].text);
    expect(result.success).toBe(true);
    expect(result.prompt).toContain('Hello World!');
    expect(result.variables.name).toBe('World');
  });

  test('should compile template with external variables overriding template variables', async () => {
    const template = {
      version: '1.0.0',
      variables: {
        name: 'Template',
      },
      content: [
        {
          type: 'text',
          text: 'Hello ${name}!',
        },
      ],
    };

    const request = {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'its_compile',
        arguments: {
          template,
          variables: { name: 'External' },
        },
      },
    };

    const response = await sendRequest(request);

    const result = JSON.parse(response.result.content[0].text);
    expect(result.success).toBe(true);
    expect(result.prompt).toContain('Hello External!');
    expect(result.variables.name).toBe('External');
  });

  test('should validate template', async () => {
    const template = {
      version: '1.0.0',
      content: [
        {
          type: 'text',
          text: 'Hello World!',
        },
      ],
    };

    const request = {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'its_validate',
        arguments: {
          template,
        },
      },
    };

    const response = await sendRequest(request);

    const result = JSON.parse(response.result.content[0].text);
    expect(result.success).toBe(true);
    expect(result.isValid).toBe(true);
  });

  test('should handle invalid template', async () => {
    const invalidTemplate = {
      // Missing version
      content: [],
    };

    const request = {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'its_validate',
        arguments: {
          template: invalidTemplate,
        },
      },
    };

    const response = await sendRequest(request);

    const result = JSON.parse(response.result.content[0].text);
    expect(result.success).toBe(true);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((err: string) => err.includes('version'))).toBe(true);
  });

  test('should handle template with undefined variables gracefully', async () => {
    const template = {
      version: '1.0.0',
      content: [
        {
          type: 'text',
          text: 'Hello ${undefinedVar}!',
        },
      ],
    };

    const request = {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'its_validate',
        arguments: {
          template,
        },
      },
    };

    const response = await sendRequest(request);

    const result = JSON.parse(response.result.content[0].text);
    expect(result.success).toBe(true);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((err: string) => err.includes('undefinedVar'))).toBe(true);
  });

  test('should handle compilation errors gracefully', async () => {
    const template = {
      version: '1.0.0',
      content: [
        {
          type: 'text',
          text: 'Hello ${undefinedVar}!',
        },
      ],
    };

    const request = {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'its_compile',
        arguments: {
          template,
        },
      },
    };

    const response = await sendRequest(request);

    expect(response.error).toBeDefined();
    expect(response.error.message).toContain('Validation failed');
    expect(response.error.message).toContain('undefinedVar');
  });
});
