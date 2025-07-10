/**
 * Basic integration tests for ITSCompiler
 */

import { ITSCompiler } from '../src/compiler';
import { DEFAULT_SECURITY_CONFIG } from '../src/security';
import { ITSValidationError, ITSTemplate, TextElement, ConditionalElement } from '../src/types';

// Define helper function locally
function createMockTemplate(): ITSTemplate {
  return {
    version: '1.0.0',
    content: [
      {
        type: 'text',
        text: 'Hello world',
      } as TextElement,
    ],
  };
}

describe('ITSCompiler', () => {
  let compiler: ITSCompiler;

  beforeEach(() => {
    compiler = new ITSCompiler();
  });

  describe('compile', () => {
    it('should compile a simple text-only template', async () => {
      const template = createMockTemplate();

      const result = await compiler.compile(template);

      expect(result.prompt).toContain('Hello world');
      expect(result.template).toEqual(template);
      expect(result.warnings).toEqual([]);
      expect(result.overrides).toEqual([]);
    });

    it('should compile a template with variables', async () => {
      const template: ITSTemplate = {
        version: '1.0.0',
        variables: {
          name: 'John',
        },
        content: [
          {
            type: 'text',
            text: 'Hello ${name}!',
          } as TextElement,
        ],
      };

      const result = await compiler.compile(template);

      expect(result.prompt).toContain('Hello John!');
    });

    it('should compile with external variables overriding template variables', async () => {
      const template: ITSTemplate = {
        version: '1.0.0',
        variables: {
          name: 'Template Name',
        },
        content: [
          {
            type: 'text',
            text: 'Hello ${name}!',
          } as TextElement,
        ],
      };

      const variables = { name: 'External Name' };
      const result = await compiler.compile(template, variables);

      expect(result.prompt).toContain('Hello External Name!');
      expect(result.variables.name).toBe('External Name');
    });

    it('should handle conditional content', async () => {
      const template: ITSTemplate = {
        version: '1.0.0',
        variables: {
          showExtra: true,
        },
        content: [
          {
            type: 'text',
            text: 'Basic content',
          } as TextElement,
          {
            type: 'conditional',
            condition: 'showExtra == true',
            content: [
              {
                type: 'text',
                text: ' Extra content',
              } as TextElement,
            ],
          } as ConditionalElement,
        ],
      };

      const result = await compiler.compile(template);

      expect(result.prompt).toContain('Basic content');
      expect(result.prompt).toContain('Extra content');
    });

    it('should handle conditional content with else clause', async () => {
      const template: ITSTemplate = {
        version: '1.0.0',
        variables: {
          showExtra: false,
        },
        content: [
          {
            type: 'conditional',
            condition: 'showExtra == true',
            content: [
              {
                type: 'text',
                text: 'Extra content',
              } as TextElement,
            ],
            else: [
              {
                type: 'text',
                text: 'Default content',
              } as TextElement,
            ],
          } as ConditionalElement,
        ],
      };

      const result = await compiler.compile(template);

      expect(result.prompt).not.toContain('Extra content');
      expect(result.prompt).toContain('Default content');
    });

    it('should reject template with missing required fields', async () => {
      const invalidTemplate = {
        content: [{ type: 'text', text: 'Hello' } as TextElement],
        // Missing version
      };

      await expect(compiler.compile(invalidTemplate as any)).rejects.toThrow(ITSValidationError);
    });

    it('should reject template with invalid content type', async () => {
      const invalidTemplate = {
        version: '1.0.0',
        content: [{ type: 'invalid_type' as any, text: 'Hello' }],
      };

      await expect(compiler.compile(invalidTemplate as any)).rejects.toThrow(ITSValidationError);
    });
  });

  describe('validate', () => {
    it('should validate a correct template', async () => {
      const template = createMockTemplate();

      const result = await compiler.validate(template);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.securityIssues).toEqual([]);
    });

    it('should detect missing required fields', async () => {
      const invalidTemplate = {
        content: [],
      };

      const result = await compiler.validate(invalidTemplate as any);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required field: version');
    });

    it('should detect empty content array', async () => {
      const template: ITSTemplate = {
        version: '1.0.0',
        content: [],
      };

      const result = await compiler.validate(template);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Field 'content' cannot be empty");
    });

    it('should detect undefined variables', async () => {
      const template: ITSTemplate = {
        version: '1.0.0',
        content: [
          {
            type: 'text',
            text: 'Hello ${undefinedVar}!',
          } as TextElement,
        ],
      };

      const result = await compiler.validate(template);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(err => err.includes('undefinedVar'))).toBe(true);
    });
  });

  describe('security', () => {
    it('should block malicious script content in strict mode', async () => {
      const strictCompiler = new ITSCompiler(DEFAULT_SECURITY_CONFIG);
      const maliciousTemplate: ITSTemplate = {
        version: '1.0.0',
        content: [
          {
            type: 'text',
            text: '<script>alert("xss")</script>',
          } as TextElement,
        ],
      };

      await expect(strictCompiler.compile(maliciousTemplate)).rejects.toThrow();
    });

    it('should block dangerous variable names', async () => {
      // Create the malicious template using a more explicit approach
      // to ensure __proto__ is actually set as a property
      const maliciousTemplate: ITSTemplate = {
        version: '1.0.0',
        variables: {},
        content: [
          {
            type: 'text',
            text: 'Hello world',
          } as TextElement,
        ],
      };

      // Explicitly set the dangerous property
      (maliciousTemplate.variables as any)['__proto__'] = { malicious: true };

      await expect(compiler.compile(maliciousTemplate)).rejects.toThrow();
    });

    it('should block dangerous conditional expressions', async () => {
      const maliciousTemplate: ITSTemplate = {
        version: '1.0.0',
        content: [
          {
            type: 'conditional',
            condition: 'eval("malicious code")',
            content: [{ type: 'text', text: 'Should not execute' } as TextElement],
          } as ConditionalElement,
        ],
      };

      await expect(compiler.compile(maliciousTemplate)).rejects.toThrow();
    });
  });

  describe('getSecurityStatus', () => {
    it('should return security status information', () => {
      const status = compiler.getSecurityStatus();

      expect(status.securityEnabled).toBe(true);
      expect(status.config).toBeDefined();
      expect(status.cache).toBeDefined();
    });
  });

  describe('clearCache', () => {
    it('should clear the schema cache', () => {
      // This test mainly ensures the method exists and doesn't throw
      expect(() => compiler.clearCache()).not.toThrow();
    });
  });
});
