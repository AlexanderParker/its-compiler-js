#!/usr/bin/env node

/**
 * Command-line interface for ITS Compiler
 */

import { promises as fs } from 'fs';
import { Command } from 'commander';
import chalk from 'chalk';
import chokidar from 'chokidar';
import { ITSCompiler } from './compiler.js';
import { DEFAULT_SECURITY_CONFIG } from './security.js';
import { ITSError, ITSValidationError, ITSCompilationError, ITSSecurityError, SecurityConfig } from './types.js';

const program = new Command();

interface CliOptions {
  output?: string;
  variables?: string;
  watch?: boolean;
  validateOnly?: boolean;
  verbose?: boolean;
  strict?: boolean;
  allowHttp?: boolean;
  timeout?: string;
  maxTemplateSize?: string;
  maxContentElements?: string;
}

async function loadVariables(variablesPath: string): Promise<Record<string, any>> {
  try {
    const content = await fs.readFile(variablesPath, 'utf-8');
    const variables = JSON.parse(content);

    if (typeof variables !== 'object' || variables === null) {
      throw new Error('Variables file must contain a JSON object');
    }

    return variables;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in variables file: ${error.message}`);
    }
    throw new Error(`Failed to load variables file: ${error}`);
  }
}

function createSecurityConfig(options: CliOptions): SecurityConfig {
  const config: SecurityConfig = {
    ...DEFAULT_SECURITY_CONFIG,
  };

  // Override specific settings based on CLI options
  if (options.allowHttp) {
    config.allowHttp = true;
  }

  if (options.timeout) {
    config.requestTimeout = parseInt(options.timeout, 10) * 1000;
  }

  if (options.strict) {
    // Stricter limits in strict mode
    config.maxTemplateSize = 512 * 1024; // 512KB
    config.maxContentElements = 500;
    config.maxNestingDepth = 8;
  }

  if (options.maxTemplateSize) {
    const sizeInKB = parseInt(options.maxTemplateSize, 10);
    config.maxTemplateSize = sizeInKB * 1024;
  }

  if (options.maxContentElements) {
    config.maxContentElements = parseInt(options.maxContentElements, 10);
  }

  return config;
}

async function compileTemplate(templatePath: string, options: CliOptions): Promise<boolean> {
  try {
    // Load variables if provided
    let variables: Record<string, any> = {};
    if (options.variables) {
      try {
        variables = await loadVariables(options.variables);
        if (options.verbose) {
          console.log(chalk.blue(`Loaded ${Object.keys(variables).length} variables from ${options.variables}`));
        }
      } catch (error) {
        console.error(chalk.red(`Error loading variables: ${error}`));
        return false;
      }
    }

    // Create security configuration
    const securityConfig = createSecurityConfig(options);

    // Create compiler
    const compiler = new ITSCompiler(securityConfig);

    if (options.verbose) {
      console.log(chalk.blue('Security Configuration:'));
      console.log(`  HTTP allowed: ${securityConfig.allowHttp}`);
      console.log(`  Block localhost: ${securityConfig.blockLocalhost}`);
      console.log(`  Max template size: ${Math.round(securityConfig.maxTemplateSize / 1024)}KB`);
      console.log(`  Max content elements: ${securityConfig.maxContentElements}`);
      console.log(`  Request timeout: ${securityConfig.requestTimeout}ms`);
    }

    const startTime = Date.now();

    if (options.validateOnly) {
      // Validation only
      const template = JSON.parse(await fs.readFile(templatePath, 'utf-8'));
      const result = await compiler.validate(template);

      if (result.isValid) {
        console.log(chalk.green('✓ Template is valid'));
        if (result.warnings.length > 0 && options.verbose) {
          result.warnings.forEach((warning: string) => {
            console.log(chalk.yellow(`⚠ Warning: ${warning}`));
          });
        }
        return true;
      } else {
        console.log(chalk.red('✗ Template validation failed'));
        result.errors.forEach((error: string) => {
          console.log(chalk.red(`Error: ${error}`));
        });
        result.securityIssues.forEach((issue: string) => {
          console.log(chalk.red(`Security: ${issue}`));
        });
        return false;
      }
    } else {
      // Full compilation
      const result = await compiler.compileFile(templatePath, variables);

      const compilationTime = Date.now() - startTime;
      if (process.stdout.isTTY) {
        console.log(chalk.green(`✓ Template compiled successfully (${compilationTime}ms)`));
      }

      // Show warnings and overrides if verbose
      if (options.verbose) {
        if (result.overrides.length > 0) {
          console.log(chalk.yellow('Type Overrides:'));
          result.overrides.forEach((override: any) => {
            console.log(`  ${override.typeName}: ${override.overrideSource} -> ${override.overriddenSource}`);
          });
        }

        if (result.warnings.length > 0) {
          console.log(chalk.yellow('Warnings:'));
          result.warnings.forEach((warning: string) => {
            console.log(`  ${warning}`);
          });
        }
      }

      // Output result
      if (options.output) {
        try {
          await fs.writeFile(options.output, result.prompt, 'utf-8');
          console.log(chalk.blue(`Output written to: ${options.output}`));
        } catch (error) {
          console.error(chalk.red(`Failed to write output file: ${error}`));
          return false;
        }
      } else {
        // Only show delimiters when outputting to a terminal (TTY)
        // When redirected or piped, process.stdout.isTTY will be false
        if (process.stdout.isTTY) {
          console.log('\n' + '='.repeat(80));
          console.log(result.prompt);
          console.log('='.repeat(80));
        } else {
          // Direct output without delimiters for redirection/piping
          console.log(result.prompt);
        }
      }

      return true;
    }
  } catch (error) {
    if (error instanceof ITSSecurityError) {
      console.error(chalk.red(`Security Error: ${error.message}`));
      if (options.verbose && error.threatType) {
        console.error(chalk.red(`Threat Type: ${error.threatType}`));
      }
    } else if (error instanceof ITSValidationError) {
      console.error(chalk.red(`Validation Error: ${error.message}`));
      if (error.path) {
        console.error(chalk.red(`Path: ${error.path}`));
      }
      error.validationErrors.forEach((err: string) => {
        console.error(chalk.red(`  • ${err}`));
      });
      error.securityIssues.forEach((issue: string) => {
        console.error(chalk.red(`  • Security: ${issue}`));
      });
    } else if (error instanceof ITSCompilationError) {
      console.error(chalk.red(`Compilation Error: ${error.message}`));
      if (error.elementId) {
        console.error(chalk.red(`Element ID: ${error.elementId}`));
      }
    } else if (error instanceof ITSError) {
      console.error(chalk.red(`ITS Error: ${error.message}`));
      if (options.verbose && error.details) {
        console.error(chalk.red(`Details: ${JSON.stringify(error.details, null, 2)}`));
      }
    } else {
      console.error(chalk.red(`Unexpected error: ${error}`));
      if (options.verbose && error instanceof Error) {
        console.error(chalk.red(error.stack || ''));
      }
    }

    return false;
  }
}

async function watchMode(templatePath: string, options: CliOptions): Promise<void> {
  console.log(chalk.blue(`\nWatching ${templatePath} for changes... (Press Ctrl+C to stop)`));

  const watcher = chokidar.watch(templatePath);

  watcher.on('change', async () => {
    console.log(chalk.yellow(`\nFile changed: ${templatePath}`));
    try {
      const success = await compileTemplate(templatePath, options);
      if (success) {
        console.log(chalk.green('✓ Watch compilation successful'));
      } else {
        console.log(chalk.blue('⏳ Waiting for fixes... (Ctrl+C to stop)'));
      }
    } catch (error) {
      console.error(chalk.red(`Watch compilation failed: ${error}`));
      console.log(chalk.blue('⏳ Continuing to watch for changes...'));
    }
  });

  watcher.on('error', error => {
    console.error(chalk.red(`Watch error: ${error}`));
  });

  // Keep the process running
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n🛑 Stopping watch mode...'));
    watcher.close();
    process.exit(0);
  });
}

// CLI setup
program
  .name('its-compile-js')
  .description('ITS Compiler - Convert ITS templates to AI prompts')
  .version('1.0.0')
  .argument('<template-file>', 'Path to the ITS template JSON file')
  .option('-o, --output <file>', 'Output file (default: stdout)')
  .option('-v, --variables <file>', 'JSON file with variable values')
  .option('-w, --watch', 'Watch template file for changes')
  .option('--validate-only', 'Validate template without compiling')
  .option('--verbose', 'Show detailed output')
  .option('--strict', 'Enable strict validation mode (smaller limits)')
  .option('--allow-http', 'Allow HTTP URLs (not recommended for production)')
  .option('--timeout <seconds>', 'Network timeout in seconds', '10')
  .option('--max-template-size <kb>', 'Maximum template size in KB')
  .option('--max-content-elements <number>', 'Maximum number of content elements')
  .action(async (templateFile: string, options: CliOptions) => {
    try {
      // Check if template file exists
      await fs.access(templateFile);
    } catch {
      console.error(chalk.red(`Template file not found: ${templateFile}`));
      process.exit(1);
    }

    if (options.watch && options.validateOnly) {
      console.error(chalk.red('Cannot use --watch with --validate-only'));
      process.exit(1);
    }

    // Validate numeric options
    if (options.timeout && (isNaN(parseInt(options.timeout)) || parseInt(options.timeout) <= 0)) {
      console.error(chalk.red('Timeout must be a positive number'));
      process.exit(1);
    }

    if (
      options.maxTemplateSize &&
      (isNaN(parseInt(options.maxTemplateSize)) || parseInt(options.maxTemplateSize) <= 0)
    ) {
      console.error(chalk.red('Max template size must be a positive number'));
      process.exit(1);
    }

    if (
      options.maxContentElements &&
      (isNaN(parseInt(options.maxContentElements)) || parseInt(options.maxContentElements) <= 0)
    ) {
      console.error(chalk.red('Max content elements must be a positive number'));
      process.exit(1);
    }

    // Initial compilation
    const success = await compileTemplate(templateFile, options);

    if (!success && !options.watch) {
      process.exit(1);
    }

    // Watch mode
    if (options.watch && success) {
      await watchMode(templateFile, options);
    }
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, chalk.red('reason:'), reason);
  process.exit(1);
});

// Parse arguments
program.parse();
