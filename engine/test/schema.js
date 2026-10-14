// The JSON schema of the official IIIF Presentation validator. It is published without a licence, so it is
// downloaded (pinned to a commit) rather than copied into this repository.
import Ajv from 'ajv';

const SCHEMA_URL =
  'https://raw.githubusercontent.com/IIIF/presentation-validator/455c3c325b49e61ac6c393c385d9478e68ce42bd/schema/iiif_3_0.json';

const schema = await fetch(SCHEMA_URL, { signal: AbortSignal.timeout(15_000) }).then(
  (response) => (response.ok ? response.json() : undefined),
  () => undefined,
);
const validate = schema && new Ajv({ strict: false, validateFormats: false }).compile(schema);

/** Pass to a test's `skip`: false when the schema is to hand, otherwise the reason it is not. */
export const schemaUnavailable = !schema && 'the IIIF Presentation schema could not be downloaded';

/** What the schema finds wrong with a manifest; empty when it is valid IIIF Presentation 3.0. */
export function schemaProblems(manifest) {
  return validate(manifest) ? [] : validate.errors.slice(0, 5).map((error) => `${error.instancePath || '/'} ${error.message}`);
}
