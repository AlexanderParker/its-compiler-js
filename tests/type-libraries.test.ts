/**
 * Integration tests for the published structured-output type libraries
 * (JSON, HTML, YAML, Markdown). The libraries fill value positions inside
 * structure authored verbatim in the template text. Local fixture copies are
 * loaded via relative extends with allowLocalFileSchemas, so no network is
 * involved.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import { ITSCompiler } from '../src/compiler';
import { SecurityValidator, DEFAULT_SECURITY_CONFIG } from '../src/security';

const FIXTURES = path.join(__dirname, 'fixtures');

const RAW_OUTPUT_CLAUSES = {
  json: 'Output raw, valid JSON only - no markdown code fences, no surrounding commentary, and no explanation.',
  html: 'Output raw, valid HTML only - no markdown code fences, no surrounding commentary, and no explanation.',
  yaml: 'Output raw, valid YAML only - no markdown code fences, no surrounding commentary, and no explanation.',
  markdown:
    'Output raw, valid Markdown only - no surrounding commentary and no explanation, and do not wrap the output in code fences.',
  markdownCode: 'Output raw code only - no code fences, no surrounding commentary and no explanation.',
};

function localCompiler(): ITSCompiler {
  return new ITSCompiler({ ...DEFAULT_SECURITY_CONFIG, allowLocalFileSchemas: true });
}

describe('type library security', () => {
  it('accepts the published library URLs under the default security config', () => {
    const validator = new SecurityValidator(DEFAULT_SECURITY_CONFIG);
    const base = 'https://alexanderparker.github.io/instruction-template-specification/schema/v1.0';

    for (const file of [
      'its-json-types-v1.json',
      'its-html-types-v1.json',
      'its-yaml-types-v1.json',
      'its-markdown-types-v1.json',
    ]) {
      expect(() => validator.validateSchemaUrl(`${base}/${file}`)).not.toThrow();
    }
  });

  it('blocks localhost, private-network, traversal and dangerous-protocol schema URLs', () => {
    const validator = new SecurityValidator(DEFAULT_SECURITY_CONFIG);

    expect(() => validator.validateSchemaUrl('https://localhost/schema.json')).toThrow(
      /Localhost access blocked: localhost/
    );
    expect(() => validator.validateSchemaUrl('https://127.0.0.1/schema.json')).toThrow(/Localhost access blocked/);
    expect(() => validator.validateSchemaUrl('https://192.168.1.10/schema.json')).toThrow(/blocked/);
    expect(() => validator.validateSchemaUrl('http://example.com/schema.json')).toThrow(
      /Protocol not allowed: http:/
    );
    expect(() => validator.validateSchemaUrl('ftp://example.com/schema.json')).toThrow(/not allowed|blocked/);

    const allowlisted = new SecurityValidator({
      ...DEFAULT_SECURITY_CONFIG,
      domainAllowlist: ['alexanderparker.github.io'],
    });
    expect(() => allowlisted.validateSchemaUrl('https://example.com/schema.json')).toThrow(
      /Domain not in allowlist: example.com/
    );
    expect(() =>
      allowlisted.validateSchemaUrl(
        'https://alexanderparker.github.io/instruction-template-specification/schema/v1.0/its-standard-types-v1.json'
      )
    ).not.toThrow();
  });

  it('rejects file schema URLs unless allowLocalFileSchemas is enabled', async () => {
    const templatePath = path.join(FIXTURES, 'json-types-template.json');

    const blocked = new ITSCompiler();
    const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const validation = await blocked.validate(template, url.pathToFileURL(FIXTURES).href + '/');
    expect(validation.isValid).toBe(false);
    expect(validation.errors.join('\n')).toMatch(/Dangerous protocol blocked: file:/);

    const allowed = localCompiler();
    const result = await allowed.compileFile(templatePath);
    expect(result.prompt).toContain('<<');
  });
});

describe('JSON type library', () => {
  it('keeps the authored JSON structure verbatim with fills at value positions', async () => {
    const result = await localCompiler().compileFile(path.join(FIXTURES, 'json-types-template.json'));

    // The document scaffolding comes from the template text, not the model
    expect(result.prompt).toContain('{\n  "data": [\n');
    expect(result.prompt).toContain('"page": 1,');
    expect(result.prompt).toContain('"code": "not_found",');
    // Fills carry the raw-output clause and escaped descriptions
    expect(result.prompt).toContain(RAW_OUTPUT_CLAUSES.json);
    expect(result.prompt).toContain('([{<three orders objects with id and status fields>}])');
    expect(result.prompt).toContain('without the enclosing square brackets');
    expect(result.prompt).toContain('of kind integer');
  });

  it('evaluates conditionals from variables', async () => {
    const templatePath = path.join(FIXTURES, 'json-types-template.json');

    const withError = await localCompiler().compileFile(templatePath);
    expect(withError.prompt).toContain('not_found');

    const withoutError = await localCompiler().compileFile(templatePath, { includeErrorExample: false });
    expect(withoutError.prompt).not.toContain('not_found');
  });

  it('renders template strings from configSchema defaults when config is omitted', async () => {
    const result = await localCompiler().compileFile(path.join(FIXTURES, 'json-types-template.json'));

    // json_value placeholder sets only a description; valueType defaults to any
    expect(result.prompt).toContain('of type any');
    expect(result.prompt).not.toContain('{valueType}');
    expect(result.prompt).not.toContain('{numberType}');
  });
});

describe('HTML type library', () => {
  it('generates a complete element from html_list', async () => {
    const template = {
      $schema: 'https://alexanderparker.github.io/instruction-template-specification/schema/v1.0/its-base-schema-v1.json',
      version: '1.0.0',
      extends: ['./its-html-types-v1.json'],
      content: [
        { type: 'text', text: '<nav>\n' },
        {
          type: 'placeholder',
          instructionType: 'html_list',
          config: {
            description: 'links to the main documentation sections',
            listType: 'unordered',
            itemCount: 4,
          },
        },
        { type: 'text', text: '\n</nav>' },
      ],
    };

    const result = await localCompiler().compile(template as never, undefined, {
      baseUrl: url.pathToFileURL(FIXTURES).href + '/',
    });

    expect(result.prompt).toContain('Produce a complete unordered list element including its items');
    expect(result.prompt).toContain(RAW_OUTPUT_CLAUSES.html);
    expect(result.prompt).toContain('([{<links to the main documentation sections>}])');
  });

  it('keeps the authored markup verbatim with fills inside it', async () => {
    const result = await localCompiler().compileFile(path.join(FIXTURES, 'html-types-template.json'));

    expect(result.prompt).toContain('<section class="product-card">');
    expect(result.prompt).toContain('<thead><tr><th>Specification</th><th>Value</th></tr></thead>');
    expect(result.prompt).toContain(RAW_OUTPUT_CLAUSES.html);
    expect(result.prompt).toContain('([{<a summary of the Solar Garden Lantern>}])');
    expect(result.prompt).toContain('without the enclosing list tags');
    expect(result.prompt).toContain('without the enclosing table, thead or tbody tags');
    // Booleans substitute JSON-style
    expect(result.prompt).toContain('Inline markup such as strong, em and a is allowed: true.');
    // html_fragment placeholder relies on the includeClasses default
    expect(result.prompt).toContain('Include class attributes on elements: true.');
    expect(result.prompt).not.toContain('{includeClasses}');
  });
});

describe('YAML type library', () => {
  it('keeps the authored YAML structure verbatim with fills at value positions', async () => {
    const result = await localCompiler().compileFile(path.join(FIXTURES, 'yaml-types-template.json'));

    expect(result.prompt).toContain('build:\n  script:\n');
    expect(result.prompt).toContain(RAW_OUTPUT_CLAUSES.yaml);
    expect(result.prompt).toContain('([{<commands that build example-storefront>}])');
    expect(result.prompt).toContain('beginning with 4 spaces followed by a hyphen');
    // yaml_block placeholder relies on the indentSpaces default
    expect(result.prompt).toContain('indented by 2 spaces');
    expect(result.prompt).not.toContain('{indentSpaces}');
  });
});

describe('Markdown type library', () => {
  it('keeps the authored Markdown scaffolding verbatim with fills inside it', async () => {
    const result = await localCompiler().compileFile(path.join(FIXTURES, 'markdown-types-template.json'));

    // The document scaffolding comes from the template text, not the model
    expect(result.prompt).toContain('# example-storefront release notes');
    expect(result.prompt).toContain('## Features\n');
    expect(result.prompt).toContain('| Package | Version |\n| --- | --- |\n');
    expect(result.prompt).toContain('## Installation\n\n```bash\n');
    expect(result.prompt).toContain('\n```');
    // Fills carry the raw-output clauses and escaped descriptions
    expect(result.prompt).toContain(RAW_OUTPUT_CLAUSES.markdown);
    expect(result.prompt).toContain(RAW_OUTPUT_CLAUSES.markdownCode);
    expect(result.prompt).toContain('([{<three headline features of example-storefront>}])');
    expect(result.prompt).toContain('without producing a header or separator row');
  });

  it('evaluates conditionals from variables', async () => {
    const templatePath = path.join(FIXTURES, 'markdown-types-template.json');

    const withInstall = await localCompiler().compileFile(templatePath);
    expect(withInstall.prompt).toContain('## Installation');

    const withoutInstall = await localCompiler().compileFile(templatePath, { includeInstall: false });
    expect(withoutInstall.prompt).not.toContain('## Installation');
    expect(withoutInstall.prompt).not.toContain('```bash');
  });

  it('renders template strings from configSchema defaults when config is omitted', async () => {
    const result = await localCompiler().compileFile(path.join(FIXTURES, 'markdown-types-template.json'));

    // markdown_list_items omits listType; the default is bullet
    expect(result.prompt).toContain('using bullet markers');
    expect(result.prompt).not.toContain('{listType}');
  });
});
