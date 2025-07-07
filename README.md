# ITS Compiler (JavaScript/TypeScript)

[![npm version](https://badge.fury.io/js/its-compiler-js.svg)](https://badge.fury.io/js/its-compiler-js)
[![Node.js Version](https://img.shields.io/node/v/its-compiler-js.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

A JavaScript/TypeScript compiler for the [Instruction Template Specification (ITS)](https://github.com/alexanderparker/instruction-template-specification) that converts templates with placeholders into structured AI prompts.

## What is ITS?

ITS (Instruction Template Specification) is a standard format for creating reusable AI prompt templates. It allows you to:

- **Define templates** with placeholders for dynamic content
- **Use variables** to customise prompts for different scenarios
- **Add conditional logic** to include/exclude content based on variables
- **Extend schemas** to define custom instruction types
- **Ensure consistency** across AI interactions

**Simple Example:**

```json
{
  "version": "1.0.0",
  "variables": { "topic": "climate change" },
  "content": [{ "type": "text", "text": "Write about ${topic}" }]
}
```

Compiles to a structured AI prompt that replaces `${topic}` with "climate change".

## Installation

```bash
npm install its-compiler-js
```

## Command Line Usage

### Basic Commands

```bash
# Compile a template to stdout
npx its-compile template.json

# Save output to file
npx its-compile template.json --output prompt.txt

# Use custom variables
npx its-compile template.json --variables vars.json

# Watch for changes during development
npx its-compile template.json --watch

# Validate template without compiling
npx its-compile template.json --validate-only
```

### CLI Options

```
Options:
  -o, --output <file>         Output file (default: stdout)
  -v, --variables <file>      JSON file with variable values
  -w, --watch                 Watch template file for changes
  --validate-only             Validate template without compiling
  --verbose                   Show detailed output
  --development               Use development security settings
  --help                      Show help
```

### Examples

**Basic compilation:**

```bash
npx its-compile blog-template.json --output blog-prompt.txt
```

**With variables:**

```bash
# vars.json: {"productType": "smartphone", "features": 5}
npx its-compile product-template.json --variables vars.json
```

**Development mode:**

```bash
npx its-compile template.json --development --watch --verbose
```

## API Usage

### Quick Start

```typescript
import { ITSCompiler, compile } from 'its-compiler-js';

// Quick compilation
const result = await compile(templateObject, variables);
console.log(result.prompt);

// With compiler instance
const compiler = new ITSCompiler();
const result = await compiler.compileFile('template.json');
```

### Main Functions

```typescript
// Compile template file
const result = await compileFile('template.json', variables);

// Compile template object
const result = await compile(templateObject, variables);

// Validate template
const validation = await validate(templateObject);
```

### Compiler Class

```typescript
import { ITSCompiler } from 'its-compiler-js';

const compiler = new ITSCompiler(securityConfig);

// Compile from file
const result = await compiler.compileFile('template.json', variables);

// Compile from object
const result = await compiler.compile(templateObject, variables);

// Validate
const validation = await compiler.validate(templateObject);

// Clear cache
compiler.clearCache();
```

### Compilation Result

```typescript
interface CompilationResult {
  prompt: string; // The compiled AI prompt
  template: ITSTemplate; // Original template
  variables: Record<string, any>; // Resolved variables
  overrides: TypeOverride[]; // Type overrides applied
  warnings: string[]; // Compilation warnings
  compilationTime?: number; // Time taken in milliseconds
}
```

### Error Handling

```typescript
import { ITSValidationError, ITSCompilationError, ITSSecurityError } from 'its-compiler-js';

try {
  const result = await compiler.compileFile('template.json');
} catch (error) {
  if (error instanceof ITSValidationError) {
    console.error('Template validation failed:', error.message);
  } else if (error instanceof ITSCompilationError) {
    console.error('Compilation failed:', error.message);
  } else if (error instanceof ITSSecurityError) {
    console.error('Security violation:', error.message);
  }
}
```

## Template Features

### Variables

```json
{
  "variables": {
    "user": { "name": "Alice", "role": "admin" },
    "items": ["apple", "banana", "cherry"]
  },
  "content": [
    { "type": "text", "text": "Hello ${user.name}" },
    { "type": "text", "text": "First item: ${items[0]}" },
    { "type": "text", "text": "Total items: ${items.length}" }
  ]
}
```

### Conditionals

```json
{
  "variables": { "includeExamples": true, "userLevel": "advanced" },
  "content": [
    {
      "type": "conditional",
      "condition": "includeExamples == true",
      "content": [{ "type": "text", "text": "Here are some examples..." }]
    },
    {
      "type": "conditional",
      "condition": "userLevel == 'advanced'",
      "content": [{ "type": "text", "text": "Advanced content" }],
      "else": [{ "type": "text", "text": "Basic content" }]
    }
  ]
}
```

### Placeholders (with schema extensions)

```json
{
  "extends": [
    "https://alexanderparker.github.io/instruction-template-specification/schema/v1.0/its-standard-types-v1.json"
  ],
  "content": [
    {
      "type": "placeholder",
      "instructionType": "list",
      "config": {
        "description": "List benefits of ${topic}",
        "format": "bullet_points",
        "itemCount": 5
      }
    }
  ]
}
```

## Security

The compiler includes built-in security protections:

- **SSRF Protection**: Blocks private networks and validates URLs
- **Input Validation**: Scans for malicious patterns
- **Expression Sanitisation**: Validates conditional expressions
- **Prototype Pollution Protection**: Prevents `__proto__` manipulation
- **Size Limits**: Prevents oversized templates and expressions

```typescript
// Custom security configuration
const securityConfig = {
  allowHttp: false, // HTTPS only
  blockLocalhost: true, // Block localhost
  maxTemplateSize: 1024 * 1024, // 1MB limit
  maxContentElements: 1000, // Max elements
  requestTimeout: 10000, // 10 second timeout
};

const compiler = new ITSCompiler(securityConfig);
```

## Related Projects

- **[ITS Specification](https://github.com/alexanderparker/instruction-template-specification)** - Official specification and documentation
- **[ITS Python Compiler](https://github.com/alexanderparker/its-compiler-python)** - Reference Python implementation

## License

MIT - see [LICENSE](LICENSE) file for details.
