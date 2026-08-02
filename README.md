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
  --allow-local-schemas            Allow extends entries to resolve from local file paths
  --timeout <seconds>              Network timeout in seconds (default: 10)
  --max-template-size <kb>         Maximum template size in KB
  --max-content-elements <number>  Maximum number of content elements
  --max-variable-count <n>         Maximum total variables including nested values
  --max-variable-array-items <n>   Maximum items per variable array
  --max-text-length <n>            Maximum length of a text element or string value
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

## MCP Server (Model Context Protocol)

The ITS Compiler includes an MCP server that allows AI assistants to compile templates programmatically.

### Starting the MCP Server

```bash
# Start the MCP server
npx its-mcp-server

# Or if installed globally
its-mcp-server
```

### MCP Configuration

Add this to your MCP configuration file (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "its-compiler": {
      "command": "npx",
      "args": ["its-mcp-server"],
      "description": "ITS Compiler for converting templates to AI prompts"
    }
  }
}
```

### Available MCP Tools

The MCP server provides three tools:

#### `its_compile`

Compile an ITS template into an AI prompt.

**Parameters:**

- `template` (string|object): The ITS template to compile
- `variables` (object, optional): Variables to substitute in the template
- `options` (object, optional): Compilation options
  - `baseUrl` (string): Base URL for resolving relative schema references
  - `allowHttp` (boolean): Allow HTTP URLs (default: false)
  - `timeout` (number): Network timeout in seconds (default: 10)
  - `strict` (boolean): Enable strict validation mode (default: false)

#### `its_compile_file`

Compile an ITS template file into an AI prompt.

**Parameters:**

- `templatePath` (string): Path to the ITS template JSON file
- `variables` (object, optional): Variables to substitute in the template
- `options` (object, optional): Same as `its_compile`

#### `its_validate`

Validate an ITS template without compiling.

**Parameters:**

- `template` (string|object): The ITS template to validate
- `baseUrl` (string, optional): Base URL for resolving relative schema references

### MCP Usage Example

When the MCP server is running and configured, AI assistants can use it like this:

```typescript
// Compile a template
const result = await its_compile({
  template: {
    version: '1.0.0',
    content: [{ type: 'text', text: 'Hello ${name}!' }],
  },
  variables: { name: 'World' },
});

// Validate a template
const validation = await its_validate({
  template: myTemplate,
});

// Compile from file
const fileResult = await its_compile_file({
  templatePath: './my-template.json',
  variables: { product: 'smartphone' },
});
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
    { "type": "text", "text": "Last item: ${items[-1]}" },
    { "type": "text", "text": "Total items: ${items.length}" }
  ]
}
```

Array indices support negative values (`${items[-1]}` is the last item), and `.length` returns the number of items in an array.

### Collection functions

Array references support chainable function suffixes for substitution: `concat(prop?)`, `sum(prop?)`, `avg(prop?)`, `min(prop?)`, `max(prop?)` and `top(n)`. The optional `prop` selects a property from each object in the array; `top(n)` keeps the first `n` items and can be chained with the others, for example `${forecast.top(3).concat(day)}`.

Collection functions are valid in substitution only, not in conditional expressions. The aggregation functions (`sum`, `avg`, `min`, `max`) are numeric-only, and whole-number results render without a decimal part.

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

Conditional expressions support:

- Comparison operators: `==`, `!=`, `<`, `<=`, `>`, `>=`
- Logical operators: `&&`, `||`, `!`, and the word forms `and`, `or`, `not`
- Membership: `in` and `not in`, against arrays and strings
- Array literals: `status in ['active', 'trial']`
- Chained comparisons: `1 < count <= 10`
- Nested property access, array indices (including negative indices) and `.length`

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

### Reference data sources

Placeholders support two reserved config keys for supplying data to the model alongside the instruction:

- `dataSource` - a variable name, or an array of variable names, whose values the placeholder relies on
- `dataLimit` - a positive integer capping how many items of an array variable are rendered

Referenced variables render once in a REFERENCE DATA section above the template output: arrays of objects render as markdown tables, and objects render as field tables. When multiple placeholders reference the same variable, their limits merge with the largest winning, and a placeholder with no limit beats any limit. Truncated arrays state the truncation ("Showing the first N of M items."). Referencing an unknown variable name is a compile error.

Object-valued variable references in substitution (for example `${customer}` where `customer` is an object) substitute the pointer text "the customer reference data" and render the variable as reference data automatically.

### Published type libraries

The specification publishes these instruction type libraries, all importable through `extends` from `https://alexanderparker.github.io/instruction-template-specification/schema/v1.0/`:

| Library                     | File                        | Purpose                                                                                                          |
| --------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Standard Types              | `its-standard-types-v1.json` | Prose content: titles, lists, paragraphs, tables, dialogue and more                                              |
| JSON Types                  | `its-json-types-v1.json`     | Value fills inside JSON structure authored in the template: json_string, json_number, json_value, json_array_items, json_object_fields |
| HTML Types                  | `its-html-types-v1.json`     | 5 position fills (html_text, html_fragment, html_list_items, html_table_rows, html_form_fields) plus 10 complete-element generators (html_heading, html_paragraph, html_link, html_image, html_list, html_table, html_section, html_blockquote, html_code_block, html_form) |
| YAML Types                  | `its-yaml-types-v1.json`     | Fills inside literal YAML: yaml_value, yaml_list_items, yaml_block                                               |
| Markdown Types              | `its-markdown-types-v1.json` | Fills inside literal Markdown: markdown_text, markdown_block, markdown_list_items, markdown_table_rows, markdown_code |

The structured-output libraries (JSON, HTML, YAML, Markdown) instruct the model to emit raw output with no code fences and no commentary. If a placeholder omits a config property, defaults declared in the library's `configSchema` are substituted into the compiled instruction.

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
  maxVariableCount: 10000, // Max total variables including nested values
  maxVariableArrayItems: 1000, // Max items per variable array
  maxTextLength: 10000, // Max length of a text element or string value
  requestTimeout: 10000, // 10 second timeout
};

const compiler = new ITSCompiler(securityConfig);
```

All processing limits are configurable (also via `--max-variable-count`, `--max-variable-array-items` and `--max-text-length` on the CLI), sized so reference data workloads with large datasets can be accommodated by the operator.

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
- [its-compiler-dotnet](https://github.com/AlexanderParker/its-compiler-dotnet) - .NET compiler with ASP.NET service and Azure Functions samples (NuGet publication pending)
- [its-compiler-cli](https://github.com/AlexanderParker/its-compiler-cli-python) - command-line interface for the Python compiler ([PyPI](https://pypi.org/project/its-compiler-cli/))
- [its-example-templates](https://github.com/AlexanderParker/its-example-templates) - example and test templates exercising the published schemas

## License

MIT - see [LICENSE](LICENSE) file for details.
