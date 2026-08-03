import { readFileSync } from 'fs';
import { join } from 'path';
import {
  SUPPORTED_SCHEMA_VERSION,
  VERSION,
  getSupportedSchemaVersion,
  getVersion,
} from '../src/index.js';

describe('version reporting', () => {
  it('keeps VERSION in step with package.json', () => {
    // VERSION is a literal so no bundler has to resolve a JSON import when
    // building for the browser. This test is what stops it drifting, which is
    // the defect that shipped in its-compiler-cli 1.1.0 and in the Python
    // core before that.
    const manifest = JSON.parse(
      readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
    ) as { version: string };
    expect(VERSION).toBe(manifest.version);
  });

  it('exposes the package version through a function too', () => {
    expect(getVersion()).toBe(VERSION);
  });
});

describe('supported specification version', () => {
  it('reports the specification version it implements', () => {
    expect(SUPPORTED_SCHEMA_VERSION).toBe('1.0');
    expect(getSupportedSchemaVersion()).toBe(SUPPORTED_SCHEMA_VERSION);
  });

  it('is distinct from the package version', () => {
    // The package version moves with fixes; this moves only when the
    // specification does. Conflating them is what makes people ask which
    // compiler release supports which spec.
    expect(SUPPORTED_SCHEMA_VERSION).not.toBe(VERSION);
  });

  it('matches the schema path the bundled fixtures extend', () => {
    const fixture = readFileSync(
      join(__dirname, 'fixtures', 'json-types-template.json'),
      'utf8'
    );
    expect(fixture).toContain(`/schema/v${SUPPORTED_SCHEMA_VERSION}/`);
  });
});
