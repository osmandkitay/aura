export const AURA_PROTOCOL_NAME = "AURA";
export const AURA_VERSION = "2.0";
const AURA_SCHEMA_GIT_TAG = "v2.0.0-alpha.1";
// Pin schema ids to the first 2.0 tag so published artifacts stay stable as main moves.
const AURA_TAGGED_SCHEMA_BASE_URL = `https://raw.githubusercontent.com/osmandkitay/aura/${AURA_SCHEMA_GIT_TAG}/packages/aura-protocol/schema`;

export const AURA_V2_SCHEMA_URL = `${AURA_TAGGED_SCHEMA_BASE_URL}/aura-v2.schema.json`;
export const AURA_ACTION_SCHEMA_URL = `${AURA_TAGGED_SCHEMA_BASE_URL}/aura-action.schema.json`;
export const AURA_PUBLISH_SCHEMA_URL = `${AURA_TAGGED_SCHEMA_BASE_URL}/aura-publish.schema.json`;
