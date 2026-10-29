import { stableStringify } from './canonical';
import { AuraDocument, PublishedAuraAction, PublishedAuraIndex } from './schema/types';
import { AURA_ACTION_SCHEMA_URL, AURA_PUBLISH_SCHEMA_URL } from './constants';
import { signatureFor } from './validate/integrity';

export function toPublishedAction(document: AuraDocument, action: AuraDocument['actions'][number]): PublishedAuraAction {
  const { profile, revision, publisher, source, target } = document;
  return { $schema: AURA_ACTION_SCHEMA_URL, profile, revision, publisher, source, target, ...action };
}
export function toPublishedIndex(document: AuraDocument): PublishedAuraIndex {
  const { protocol, version, profile, revision, publisher, source, target } = document;
  return { $schema: AURA_PUBLISH_SCHEMA_URL, protocol, version, profile, revision, publisher, source, target,
    actions: document.actions.map(action => ({ id: action.id, key: action.key, href: 'aura/actions/' + action.id + '.json',
      ...signatureFor(action), ...(action.requires ? { requires: action.requires } : {}) })) };
}
export function assertSummary(index: PublishedAuraIndex, detail: PublishedAuraAction): void {
  const summary = index.actions.find(a => a.id === detail.id);
  const expected = { id: detail.id, key: detail.key, href: 'aura/actions/' + detail.id + '.json',
    ...signatureFor(detail), ...(detail.requires ? { requires: detail.requires } : {}) };
  if (!summary || detail.revision !== index.revision || detail.profile !== index.profile ||
    stableStringify(expected) !== stableStringify(summary) ||
    ['publisher', 'source', 'target'].some(k => stableStringify((detail as any)[k]) !== stableStringify((index as any)[k])))
    throw new Error('INDEX_DETAIL_MISMATCH: summary, provenance or revision differs');
}
