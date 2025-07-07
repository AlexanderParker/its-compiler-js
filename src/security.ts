/**
 * Security validation and protection for ITS Compiler
 */

import { URL } from 'url';
import { ITSSecurityError, SecurityConfig } from './types.js';

export class SecurityValidator {
  private config: SecurityConfig;

  constructor(config: SecurityConfig) {
    this.config = config;
  }

  /**
   * Validate template content for security issues
   */
  validateTemplate(template: any): void {
    // Check template size
    const templateStr = JSON.stringify(template);
    if (templateStr.length > this.config.maxTemplateSize) {
      throw new ITSSecurityError(
        `Template too large: ${templateStr.length} bytes`,
        'template_size',
        'SIZE_LIMIT_EXCEEDED'
      );
    }

    // Check content elements count
    if (template.content && Array.isArray(template.content)) {
      if (template.content.length > this.config.maxContentElements) {
        throw new ITSSecurityError(
          `Too many content elements: ${template.content.length}`,
          'content_elements',
          'SIZE_LIMIT_EXCEEDED'
        );
      }

      // Validate content structure
      this.validateContent(template.content, 0);
    }

    // Validate variables - THIS WAS THE BUG!
    // The original code only validated variables if template.variables existed,
    // but we need to validate ALL variables including dangerous keys
    if (template.variables) {
      this.validateVariables(template.variables, '', 0);
    }

    // Validate extensions
    if (template.extends && Array.isArray(template.extends)) {
      for (const url of template.extends) {
        this.validateSchemaUrl(url);
      }
    }
  }

  /**
   * Validate content elements recursively
   */
  private validateContent(content: any[], depth: number): void {
    if (depth > this.config.maxNestingDepth) {
      throw new ITSSecurityError(`Content nesting too deep: ${depth}`, 'nesting_depth', 'SIZE_LIMIT_EXCEEDED');
    }

    for (const element of content) {
      if (element.type === 'text') {
        this.validateTextContent(element.text);
      } else if (element.type === 'conditional') {
        this.validateConditionalExpression(element.condition);
        if (element.content) {
          this.validateContent(element.content, depth + 1);
        }
        if (element.else) {
          this.validateContent(element.else, depth + 1);
        }
      } else if (element.type === 'placeholder') {
        this.validatePlaceholderConfig(element.config);
      }
    }
  }

  /**
   * Validate text content for malicious patterns
   */
  private validateTextContent(text: string): void {
    const dangerousPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript\s*:/gi,
      /data\s*:\s*text\/html/gi,
      /eval\s*\(/gi,
      /Function\s*\(/gi,
      /setTimeout\s*\(/gi,
      /setInterval\s*\(/gi,
      /document\.\w+/gi,
      /window\.\w+/gi,
      /\\x[0-9a-fA-F]{2}/gi,
      /\\u[0-9a-fA-F]{4}/gi,
      /%[0-9a-fA-F]{2}/gi,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(text)) {
        throw new ITSSecurityError(
          'Malicious content detected in text',
          'content_validation',
          'MALICIOUS_CONTENT',
          text.substring(0, 100)
        );
      }
    }
  }

  /**
   * Validate conditional expressions
   */
  private validateConditionalExpression(expression: string): void {
    if (expression.length > this.config.maxExpressionLength) {
      throw new ITSSecurityError(
        `Expression too long: ${expression.length} characters`,
        'expression_length',
        'SIZE_LIMIT_EXCEEDED'
      );
    }

    const dangerousPatterns = [
      /__\w+__/,
      /exec\s*\(/,
      /eval\s*\(/,
      /import\s+/,
      /open\s*\(/,
      /subprocess/,
      /os\./,
      /sys\./,
      /globals\s*\(/,
      /locals\s*\(/,
      /getattr\s*\(/,
      /setattr\s*\(/,
      /hasattr\s*\(/,
      /delattr\s*\(/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(expression)) {
        throw new ITSSecurityError(
          'Dangerous pattern in conditional expression',
          'expression_validation',
          'MALICIOUS_CONTENT',
          expression.substring(0, 100)
        );
      }
    }
  }

  /**
   * Validate placeholder configuration
   */
  private validatePlaceholderConfig(config: any): void {
    for (const [_key, value] of Object.entries(config)) {
      if (typeof value === 'string') {
        this.validateTextContent(value);
      } else if (typeof value === 'object' && value !== null) {
        this.validatePlaceholderConfig(value);
      }
    }
  }

  /**
   * Validate variables object
   */
  private validateVariables(variables: any, path: string, depth: number): void {
    if (depth > this.config.maxNestingDepth) {
      throw new ITSSecurityError(`Variable nesting too deep at ${path}`, 'variable_nesting', 'SIZE_LIMIT_EXCEEDED');
    }

    // Check for prototype pollution by examining the object's prototype
    if (variables.__proto__ && variables.__proto__ !== Object.prototype) {
      throw new ITSSecurityError(
        'Prototype pollution detected: __proto__ has been modified',
        'prototype_pollution',
        'MALICIOUS_CONTENT'
      );
    }

    // Check for dangerous properties that might not show up in Object.entries()
    // This catches cases where __proto__ was used as an object literal key
    const dangerousProps = ['__proto__', 'constructor', 'prototype'];
    for (const prop of dangerousProps) {
      if (Object.prototype.hasOwnProperty.call(variables, prop)) {
        throw new ITSSecurityError(`Dangerous property detected: ${prop}`, 'dangerous_property', 'MALICIOUS_CONTENT');
      }
    }

    // Use Object.getOwnPropertyNames to catch all properties, including non-enumerable ones
    const allKeys = Object.getOwnPropertyNames(variables);
    for (const key of allKeys) {
      // Check for dangerous variable names
      if (this.isDangerousVariableName(key)) {
        throw new ITSSecurityError(`Dangerous variable name: ${key}`, 'variable_name', 'MALICIOUS_CONTENT');
      }
    }

    // Now validate the values using Object.entries (for enumerable properties)
    for (const [key, value] of Object.entries(variables)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (typeof value === 'string') {
        this.validateTextContent(value);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        this.validateVariables(value, currentPath, depth + 1);
      } else if (Array.isArray(value)) {
        if (value.length > 1000) {
          throw new ITSSecurityError(
            `Array too large at ${currentPath}: ${value.length} items`,
            'array_size',
            'SIZE_LIMIT_EXCEEDED'
          );
        }
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] === 'string') {
            this.validateTextContent(value[i]);
          } else if (typeof value[i] === 'object' && value[i] !== null) {
            this.validateVariables({ [i]: value[i] }, `${currentPath}[${i}]`, depth + 1);
          }
        }
      }
    }
  }

  /**
   * Check if variable name is dangerous
   */
  private isDangerousVariableName(name: string): boolean {
    const dangerousNames = new Set([
      '__proto__',
      'constructor',
      'prototype',
      '__builtins__',
      '__globals__',
      '__locals__',
      '__import__',
      'exec',
      'eval',
      'compile',
      'open',
      'input',
      'globals',
      'locals',
      'vars',
      'dir',
      'getattr',
      'setattr',
      'hasattr',
      'delattr',
      'function',
      'this',
      'window',
      'document',
      'global',
      'process',
    ]);

    return dangerousNames.has(name.toLowerCase()) || name.startsWith('__');
  }

  /**
   * Validate schema URL for SSRF protection
   */
  validateSchemaUrl(url: string): void {
    try {
      const parsedUrl = new URL(url);

      // Check protocol
      if (!parsedUrl.protocol.startsWith('https:')) {
        if (!this.config.allowHttp || parsedUrl.protocol !== 'http:') {
          throw new ITSSecurityError(`Protocol not allowed: ${parsedUrl.protocol}`, 'url_protocol', 'SSRF_BLOCKED');
        }
      }

      // Block dangerous protocols
      const dangerousProtocols = ['file:', 'ftp:', 'gopher:', 'ldap:', 'dict:', 'data:'];
      if (dangerousProtocols.includes(parsedUrl.protocol)) {
        throw new ITSSecurityError(`Dangerous protocol blocked: ${parsedUrl.protocol}`, 'url_protocol', 'SSRF_BLOCKED');
      }

      // Check hostname
      if (parsedUrl.hostname) {
        this.validateHostname(parsedUrl.hostname);
      }

      // Check for domain allowlist
      if (this.config.domainAllowlist && this.config.domainAllowlist.length > 0) {
        if (!this.isDomainAllowed(parsedUrl.hostname)) {
          throw new ITSSecurityError(
            `Domain not in allowlist: ${parsedUrl.hostname}`,
            'domain_allowlist',
            'SSRF_BLOCKED'
          );
        }
      }

      // Check for path traversal
      if (parsedUrl.pathname.includes('..')) {
        throw new ITSSecurityError('Path traversal detected in URL', 'path_traversal', 'SSRF_BLOCKED');
      }
    } catch (error) {
      if (error instanceof ITSSecurityError) {
        throw error;
      }
      throw new ITSSecurityError(`Invalid URL: ${url}`, 'url_validation', 'SSRF_BLOCKED');
    }
  }

  /**
   * Validate hostname for SSRF protection
   */
  private validateHostname(hostname: string): void {
    // Block localhost variants
    if (this.config.blockLocalhost) {
      const localhostVariants = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
      if (localhostVariants.includes(hostname.toLowerCase())) {
        throw new ITSSecurityError(`Localhost access blocked: ${hostname}`, 'localhost_blocked', 'SSRF_BLOCKED');
      }
    }

    // Block private networks
    if (this.config.blockPrivateNetworks) {
      if (this.isPrivateNetwork(hostname)) {
        throw new ITSSecurityError(
          `Private network access blocked: ${hostname}`,
          'private_network_blocked',
          'SSRF_BLOCKED'
        );
      }
    }
  }

  /**
   * Check if hostname is in private network range
   */
  private isPrivateNetwork(hostname: string): boolean {
    // Basic check for common private IP ranges
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./, // Link-local
    ];

    return privateRanges.some(range => range.test(hostname));
  }

  /**
   * Check if domain is allowed
   */
  private isDomainAllowed(hostname: string): boolean {
    if (!this.config.domainAllowlist) {
      return true;
    }

    return this.config.domainAllowlist.some(allowedDomain => {
      // Exact match
      if (hostname === allowedDomain) {
        return true;
      }
      // Subdomain match
      if (hostname.endsWith('.' + allowedDomain)) {
        return true;
      }
      return false;
    });
  }
}

/**
 * Default security configuration
 */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  allowHttp: false,
  blockLocalhost: true,
  blockPrivateNetworks: true,
  maxTemplateSize: 1024 * 1024, // 1MB
  maxContentElements: 1000,
  maxNestingDepth: 10,
  maxExpressionLength: 500,
  requestTimeout: 10000, // 10 seconds
};

/**
 * Development security configuration (more permissive)
 */
export const DEVELOPMENT_SECURITY_CONFIG: SecurityConfig = {
  allowHttp: true,
  blockLocalhost: false,
  blockPrivateNetworks: false,
  maxTemplateSize: 5 * 1024 * 1024, // 5MB
  maxContentElements: 2000,
  maxNestingDepth: 15,
  maxExpressionLength: 1000,
  requestTimeout: 30000, // 30 seconds
};
