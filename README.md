# ITS Compiler (JavaScript/TypeScript)

[![npm version](https://badge.fury.io/js/its-compiler-js.svg)](https://badge.fury.io/js/its-compiler-js)
[![Node.js Version](https://img.shields.io/node/v/its-compiler-js.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

A JavaScript/TypeScript compiler for the [Instruction Template Specification (ITS)](https://github.com/alexanderparker/instruction-template-specification) that converts templates with placeholders into structured AI prompts.

## Installation

```bash
npm i its-compiler-js
```

Or globally

```bash
npm i -g its-compiler-js
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
  -o, --output <file>              Output file (default: stdout)
  -v, --variables <file>           JSON file with variable values
  -w, --watch                      Watch template file for changes
  --validate-only                  Validate template without compiling
  --verbose                        Show detailed output
  --strict                         Enable strict validation mode (smaller limits)
  --allow-http                     Allow HTTP URLs (not recommended for production)
  --timeout <seconds>              Network timeout in seconds (default: 10)
  --max-template-size <kb>         Maximum template size in KB
  --max-content-elements <number>  Maximum number of content elements
  --help
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

**Strict mode with custom limits:**

```bash
npx its-compile template.json --strict --max-template-size 256 --verbose
```

**Allow HTTP schemas (development only):**

```bash
npx its-compile template.json --allow-http --timeout 30
```

**Watch mode:**

```bash
npx its-compile template.json --watch --verbose
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

### Published type libraries

The specification publishes these instruction type libraries, all importable through `extends` from `https://alexanderparker.github.io/instruction-template-specification/schema/v1.0/`:

| Library                     | File                        | Purpose                                                                        |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| Standard Types              | `its-standard-types-v1.json` | Prose content: titles, lists, paragraphs, tables, dialogue and more            |
| JSON Types                  | `its-json-types-v1.json`     | Raw JSON output: values, objects, arrays, JSON Schema documents                |
| HTML Types                  | `its-html-types-v1.json`     | Raw HTML fragments: containers, tables, lists, form fields (never full pages)  |
| YAML Types                  | `its-yaml-types-v1.json`     | Raw YAML output: blocks, complete documents, markdown frontmatter              |

The structured-output libraries (JSON, HTML, YAML) instruct the model to emit raw output with no markdown code fences and no commentary. If a placeholder omits a config property, defaults declared in the library's `configSchema` are substituted into the compiled instruction.

Templates can also resolve `extends` entries from local file paths relative to the template, which is useful for developing new type libraries before they are published. This is disabled by default; enable it with `--allow-local-schemas` on the CLI or `allowLocalFileSchemas: true` in the security configuration.

## Security

The compiler includes some built-in security protections - note that this is a best-effort, please thoroughly implement and test your own security safeguards when using this software:

- **Expression Safety**: Safe evaluation of conditional expressions with jsep AST parsing
- **SSRF Protection**: Blocks private networks and validates URLs
- **Input Validation**: Scans for malicious patterns
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

## For Maintainers

### Publishing to NPM

The project includes automated publishing via GitHub Actions. To publish a new version:

```bash
# For patch releases (bug fixes)
npm run release:patch

# For minor releases (new features)
npm run release:minor

# For major releases (breaking changes)
npm run release:major
```

These commands will:

1. Run tests and linting
2. Bump the version number
3. Create a git tag
4. Push the tag to trigger GitHub Actions publishing

Make sure you have the `NPM_TOKEN` secret configured in your GitHub repository settings for automated publishing to work.

## ITS ecosystem

- [Specification](https://alexanderparker.github.io/instruction-template-specification/) - the ITS spec, schemas and documentation ([source](https://github.com/AlexanderParker/instruction-template-specification))
- [Template studio demo](https://alexanderparker.github.io/its-template-studio/) - build and compile templates in the browser ([source](https://github.com/AlexanderParker/its-template-studio))
- [its-template-editor](https://github.com/AlexanderParker/its-wysiwyg-common) - the WYSIWYG React editor component behind the studio
- [its-compiler-python](https://github.com/AlexanderParker/its-compiler-python) - Python reference compiler library ([PyPI](https://pypi.org/project/its-compiler/))
- [its-compiler-cli](https://github.com/AlexanderParker/its-compiler-cli-python) - command-line interface for the Python compiler ([PyPI](https://pypi.org/project/its-compiler-cli/))
- [its-example-templates](https://github.com/AlexanderParker/its-example-templates) - example and test templates exercising the published schemas

## License

MIT - see [LICENSE](LICENSE) file for details.
