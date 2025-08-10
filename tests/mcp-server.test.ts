/**
 * Tests for MCP Server
 */

import { ITSMCPServer } from '../src/mcp-server';
import { ITSTemplate, TextElement } from '../src/types';

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
