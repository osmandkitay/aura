/**
 * Defines the authentication requirements for each capability.
 * This provides a single source of truth for permission checks.
 */
export const CAPABILITY_PERMISSIONS: Record<string, { authRequired: boolean }> = {
  // Publicly available capabilities
  'login': { authRequired: false },
  'list_posts': { authRequired: false },
  'read_post': { authRequired: false },

  // Capabilities requiring authentication
  'create_post': { authRequired: true },
  'update_post': { authRequired: true },
  'delete_post': { authRequired: true },
  'get_profile': { authRequired: true },
  'update_profile': { authRequired: true },
};

/**
 * Lists all capabilities defined in the system.
 * This should be kept in sync with aura.json.
 */
export const ALL_CAPABILITIES = Object.keys(CAPABILITY_PERMISSIONS); 