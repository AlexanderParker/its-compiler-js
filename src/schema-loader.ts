/**
 * Schema loading and caching for ITS Compiler
 */

import { promises as fs } from 'fs';
import { URL } from 'url';
import fetch from 'node-fetch';
import { ITSSecurityError, SchemaCache, SecurityConfig } from './types.js';
import { SecurityValidator } from './security.js';

export class SchemaLoader {
  private cache: SchemaCache = {};
  private cacheTTL: number;
  private securityValidator: SecurityValidator;
  private timeout: number;

  constructor(
    cacheTTL: number = 3600000, // 1 hour
    securityConfig: SecurityConfig,
    timeout: number = 10000 // 10 seconds
  ) {
    this.cacheTTL = cacheTTL;
    this.securityValidator = new SecurityValidator(securityConfig);
    this.timeout = timeout;
  }

  /**
   * Load a schema from URL or cache
   */
  async loadSchema(schemaUrl: string, baseUrl?: string): Promise<any> {
    // Resolve relative URLs
    const resolvedUrl = this.resolveUrl(schemaUrl, baseUrl);

    // Security validation
    this.securityValidator.validateSchemaUrl(resolvedUrl);

    // Check cache first
    const cached = this.getFromCache(resolvedUrl);
    if (cached) {
      return cached;
    }

    try {
      const schema = await this.loadFromUrl(resolvedUrl);
      this.saveToCache(resolvedUrl, schema);
      return schema;
    } catch (error) {
      throw new ITSSecurityError(
        `Failed to load schema from ${resolvedUrl}: ${error}`,
        'schema_loading',
        'SCHEMA_LOAD_FAILED'
      );
    }
  }

  /**
   * Resolve URL (handle relative URLs)
   */
  private resolveUrl(url: string, baseUrl?: string): string {
    if (!baseUrl || this.isAbsoluteUrl(url)) {
      return url;
    }

    try {
      const base = new URL(baseUrl);
      return new URL(url, base).toString();
    } catch (error) {
      // If URL resolution fails, return original URL
      return url;
    }
  }

  /**
   * Check if URL is absolute
   */
  private isAbsoluteUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load schema from URL
   */
  private async loadFromUrl(url: string): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'ITS-Compiler-JS/1.0',
          Accept: 'application/json, text/plain',
          'Cache-Control': 'no-cache',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check content type
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json') && !contentType.includes('text/')) {
        throw new Error(`Invalid content type: ${contentType}`);
      }

      // Check content length
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (size > 10 * 1024 * 1024) {
          // 10MB limit
          throw new Error(`Schema too large: ${size} bytes`);
        }
      }

      const text = await response.text();

      // Limit response size even if no content-length header
      if (text.length > 10 * 1024 * 1024) {
        throw new Error(`Schema response too large: ${text.length} bytes`);
      }

      const schema = JSON.parse(text);

      // Validate schema structure
      this.validateSchemaStructure(schema);

      return schema;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }

      throw error;
    }
  }

  /**
   * Validate schema structure
   */
  private validateSchemaStructure(schema: any): void {
    if (typeof schema !== 'object' || schema === null) {
      throw new Error('Schema must be a JSON object');
    }

    // Validate instructionTypes if present
    if ('instructionTypes' in schema) {
      if (typeof schema.instructionTypes !== 'object' || schema.instructionTypes === null) {
        throw new Error('instructionTypes must be an object');
      }

      for (const [typeName, typeDef] of Object.entries(schema.instructionTypes)) {
        this.validateInstructionType(typeName, typeDef);
      }
    }
  }

  /**
   * Validate individual instruction type definition
   */
  private validateInstructionType(typeName: string, typeDef: any): void {
    if (typeof typeDef !== 'object' || typeDef === null) {
      throw new Error(`Instruction type '${typeName}' must be an object`);
    }

    if (!('template' in typeDef)) {
      throw new Error(`Instruction type '${typeName}' missing required 'template' field`);
    }

    if (typeof typeDef.template !== 'string') {
      throw new Error(`Instruction type '${typeName}' template must be a string`);
    }

    // Check template for potentially dangerous patterns (but don't fail, just warn if needed)
    const dangerousPatterns = [/<script/i, /javascript:/i, /data:text\/html/i, /eval\(/i];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(typeDef.template)) {
        console.warn(`Warning: Potentially dangerous pattern in template for type '${typeName}': ${pattern}`);
      }
    }
  }

  /**
   * Get schema from cache
   */
  private getFromCache(url: string): any | null {
    const cached = this.cache[url];
    if (!cached) {
      return null;
    }

    if (Date.now() > cached.expiresAt) {
      delete this.cache[url];
      return null;
    }

    return cached.schema;
  }

  /**
   * Save schema to cache
   */
  private saveToCache(url: string, schema: any): void {
    this.cache[url] = {
      schema,
      cachedAt: Date.now(),
      expiresAt: Date.now() + this.cacheTTL,
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache = {};
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; urls: string[] } {
    const urls = Object.keys(this.cache);
    return {
      size: urls.length,
      urls,
    };
  }

  /**
   * Load schema from file (for testing)
   */
  async loadSchemaFromFile(filePath: string): Promise<any> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const schema = JSON.parse(content);
      this.validateSchemaStructure(schema);
      return schema;
    } catch (error) {
      throw new ITSSecurityError(
        `Failed to load schema from file ${filePath}: ${error}`,
        'schema_loading',
        'SCHEMA_LOAD_FAILED'
      );
    }
  }
}
