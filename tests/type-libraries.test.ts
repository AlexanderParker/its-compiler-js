/**
 * Integration tests for the published structured-output type libraries
 * (JSON, HTML, YAML). The libraries fill value positions inside structure
 * authored verbatim in the template text. Local fixture copies are loaded
 * via relative extends with allowLocalFileSchemas, so no network is involved.
 */

import * as path from 'path';
import { ITSCompiler } from '../src/compiler';
import { SecurityValidator, DEFAULT_SECURITY_CONFIG } from '../src/security';

const FIXTURES = path.join(__dirname, 'fixtures');

const RAW_OUTPUT_CLAUSES = {
  json: 'Output raw, valid JSON only - no markdown code fences, no surrounding commentary, and no explanation.',
  html: 'Output raw, valid HTML only - no markdown code fences, no surrounding commentary, and no explanation.',
  yaml: 'Output raw, valid YAML only - no markdown code fences, no surrounding commentary, and no explanation.',
};

function localCompiler(): ITSCompiler {
  return new ITSCompiler({ ...DEFAULT_SECURITY_CONFIG, allowLocalFileSchemas: true });
}

describe('type library security', () => {
  it('accepts the published library URLs under the default security config', () => {
    const validator = new SecurityValidator(DEFAULT_SECURITY_CONFIG);
    const base = 'https://alexanderparker.github.io/instruction-template-specification/schema/v1.0';

    for (const file of ['its-json-types-v1.json', 'its-html-types-v1.json', 'its-yaml-types-v1.json']) {
      expect(() => validator.validateSchemaUrl(`${base}/${file}`)).not.toThrow();
    }
  });

  it('rejects file schema URLs unless allowLocalFileSchemas is enabled', async () => {
    const templatePath = path.join(FIXTURES, 'json-types-template.json');

    const blocked = new ITSCompiler();
    await expect(blocked.compileFile(templatePath)).rejects.toThrow();

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
