/**
 * Integration tests for the published structured-output type libraries
 * (JSON, HTML, YAML). Local fixture copies of the libraries are loaded via
 * relative extends with allowLocalFileSchemas, so no network is involved.
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
  it('compiles placeholders with the raw-output clause and escaped descriptions', async () => {
    const result = await localCompiler().compileFile(path.join(FIXTURES, 'json-types-template.json'));

    expect(result.prompt).toContain(RAW_OUTPUT_CLAUSES.json);
    expect(result.prompt).toContain('([{<A orders API response object>}])');
    expect(result.prompt).toContain('two_spaces indentation');
  });

  it('evaluates conditionals from variables', async () => {
    const templatePath = path.join(FIXTURES, 'json-types-template.json');

    const withError = await localCompiler().compileFile(templatePath);
    expect(withError.prompt).toContain('not_found error object');

    const withoutError = await localCompiler().compileFile(templatePath, { includeErrorExample: false });
    expect(withoutError.prompt).not.toContain('not_found error object');
  });

  it('renders template strings from configSchema defaults when config is omitted', async () => {
    const result = await localCompiler().compileFile(path.join(FIXTURES, 'json-types-template.json'));

    // json_schema placeholder sets only description; draft and indent defaults apply
    expect(result.prompt).toContain('targets the 2020-12 draft');
    expect(result.prompt).not.toContain('{draft}');
    expect(result.prompt).not.toContain('{indent}');
  });
});

describe('HTML type library', () => {
  it('compiles placeholders with the raw-output clause and fragment-only wording', async () => {
    const result = await localCompiler().compileFile(path.join(FIXTURES, 'html-types-template.json'));

    expect(result.prompt).toContain(RAW_OUTPUT_CLAUSES.html);
    expect(result.prompt).toContain('([{<A summary paragraph for the Solar Garden Lantern>}])');
    expect(result.prompt).toContain('Do not include a doctype or html, head or body tags.');
    // html_list placeholder relies on the listType default
    expect(result.prompt).toContain('unordered list element');
    expect(result.prompt).not.toContain('{listType}');
  });
});

describe('YAML type library', () => {
  it('compiles placeholders with the raw-output clause and defaults', async () => {
    const result = await localCompiler().compileFile(path.join(FIXTURES, 'yaml-types-template.json'));

    expect(result.prompt).toContain(RAW_OUTPUT_CLAUSES.yaml);
    expect(result.prompt).toContain('([{<A CI pipeline for example-storefront>}])');
    // yaml_block placeholder relies on the indentSize default
    expect(result.prompt).toContain('2-space indentation');
    expect(result.prompt).not.toContain('{indentSize}');
  });
});
