import { AuraConfidence, AuraConfirm, AuraIntent, AuraRisk, HttpMethod } from "../schema/types";

interface NormalizeInput {
  rawName: string;
  method: HttpMethod;
  path: string;
  summary?: string;
}

interface NormalizeResult {
  key: string;
  intent: AuraIntent;
  confidence: AuraConfidence;
}

const TOKEN_NOISE = new Set(["api", "http", "https", "handler", "endpoint", "service", "resource", "final", "v1", "v2", "v3"]);
const VERB_TOKENS = new Set(["list", "search", "get", "read", "fetch", "retrieve", "create", "register", "signup", "sign", "up", "update", "edit", "patch", "delete", "remove", "destroy", "publish", "login", "logout", "signin", "signout", "authenticate", "send", "pay", "transfer", "execute", "run", "perform", "do"]);

const DOMAIN_RULES: Array<{ domain: string; tokens: string[] }> = [
  { domain: "session", tokens: ["session", "login", "logout", "signin", "signout", "authenticate", "auth", "token"] },
  { domain: "account", tokens: ["account", "user", "profile", "member", "signup", "register"] },
  { domain: "post", tokens: ["post", "posts", "article", "articles", "blog"] },
  { domain: "payment", tokens: ["payment", "payments", "pay", "charge", "transfer", "payout", "invoice", "wallet"] },
  { domain: "order", tokens: ["order", "orders", "cart", "checkout"] },
  { domain: "message", tokens: ["message", "messages", "email", "mail", "notification"] },
  { domain: "comment", tokens: ["comment", "comments"] },
  { domain: "search", tokens: ["search", "query", "find"] }
];

function tokenize(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function tokenizePath(pathValue: string): string[] {
  return pathValue
    .split("/")
    .map((segment) => segment.replace(/[{}]/g, ""))
    .filter((segment) => segment && !segment.startsWith("?"))
    .flatMap((segment) => tokenize(segment))
    .filter((token) => token !== "id");
}

function singularize(token: string): string {
  if (token.endsWith("ies") && token.length > 3) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith("s") && token.length > 3 && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }

  return token;
}

function pickKnownDomain(tokens: string[]): string | undefined {
  for (const rule of DOMAIN_RULES) {
    if (rule.tokens.some((token) => tokens.includes(token))) {
      return rule.domain;
    }
  }

  return undefined;
}

function pickFallbackDomain(tokens: string[]): string {
  const candidate = tokens.find((token) => !VERB_TOKENS.has(token) && !TOKEN_NOISE.has(token));
  return candidate ? singularize(candidate) : "action";
}

function hasAll(tokens: string[], expected: string[]): boolean {
  return expected.every((token) => tokens.includes(token));
}

function inferVerb(tokens: string[], method: HttpMethod): { verb: string; known: boolean; reason: string } {
  if (tokens.includes("logout") || hasAll(tokens, ["sign", "out"]) || tokens.includes("signout")) {
    return { verb: "logout", known: true, reason: "matched logout vocabulary" };
  }

  if (tokens.includes("login") || hasAll(tokens, ["sign", "in"]) || tokens.includes("signin") || tokens.includes("authenticate") || tokens.includes("auth")) {
    return { verb: "login", known: true, reason: "matched login vocabulary" };
  }

  if (tokens.includes("register") || tokens.includes("signup") || hasAll(tokens, ["sign", "up"])) {
    return { verb: "create", known: true, reason: "matched registration vocabulary" };
  }

  if (tokens.includes("publish") || tokens.includes("live")) {
    return { verb: "publish", known: true, reason: "matched publish vocabulary" };
  }

  if (tokens.includes("delete") || tokens.includes("remove") || tokens.includes("destroy")) {
    return { verb: "delete", known: true, reason: "matched destructive vocabulary" };
  }

  if (tokens.includes("update") || tokens.includes("edit") || tokens.includes("patch")) {
    return { verb: "update", known: true, reason: "matched update vocabulary" };
  }

  if (tokens.includes("list") || tokens.includes("browse")) {
    return { verb: "list", known: true, reason: "matched listing vocabulary" };
  }

  if (tokens.includes("search") || tokens.includes("query") || tokens.includes("find")) {
    return { verb: "search", known: true, reason: "matched search vocabulary" };
  }

  if (tokens.includes("get") || tokens.includes("read") || tokens.includes("fetch") || tokens.includes("retrieve")) {
    return { verb: "get", known: true, reason: "matched read vocabulary" };
  }

  if (tokens.includes("create") || tokens.includes("add") || tokens.includes("new")) {
    return { verb: "create", known: true, reason: "matched create vocabulary" };
  }

  if (tokens.includes("send") || tokens.includes("pay") || tokens.includes("transfer") || tokens.includes("charge")) {
    return { verb: "send", known: true, reason: "matched send vocabulary" };
  }

  if (tokens.includes("do") || tokens.includes("run") || tokens.includes("execute") || tokens.includes("perform")) {
    return { verb: "perform", known: false, reason: "fell back to a generic action verb" };
  }

  switch (method) {
    case "GET":
      return { verb: "get", known: false, reason: "fell back to the HTTP method" };
    case "POST":
      return { verb: "create", known: false, reason: "fell back to the HTTP method" };
    case "PUT":
    case "PATCH":
      return { verb: "update", known: false, reason: "fell back to the HTTP method" };
    case "DELETE":
      return { verb: "delete", known: false, reason: "fell back to the HTTP method" };
  }
}

export function humanizeIntent(intent: AuraIntent): string {
  const parts = `${intent.verb} ${intent.domain}`.split(".");
  return parts
    .join(" ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizeActionSemantics(input: NormalizeInput): NormalizeResult {
  const nameTokens = tokenize(input.rawName);
  const summaryTokens = tokenize(input.summary);
  const pathTokens = tokenizePath(input.path);
  const combinedTokens = Array.from(new Set([...nameTokens, ...summaryTokens, ...pathTokens]));

  if ((combinedTokens.includes("register") || combinedTokens.includes("signup") || hasAll(combinedTokens, ["sign", "up"]))
    && (combinedTokens.includes("user") || combinedTokens.includes("account") || combinedTokens.includes("profile") || combinedTokens.includes("member"))) {
    return {
      key: "account.create",
      intent: { domain: "account", verb: "create" },
      confidence: {
        label: "high",
        score: 0.96,
        reason: "matched an account registration pattern"
      }
    };
  }

  if (combinedTokens.includes("login") || combinedTokens.includes("signin") || hasAll(combinedTokens, ["sign", "in"]) || combinedTokens.includes("authenticate") || combinedTokens.includes("auth")) {
    return {
      key: "session.login",
      intent: { domain: "session", verb: "login" },
      confidence: {
        label: "high",
        score: 0.96,
        reason: "matched a session login pattern"
      }
    };
  }

  if (combinedTokens.includes("logout") || combinedTokens.includes("signout") || hasAll(combinedTokens, ["sign", "out"])) {
    return {
      key: "session.logout",
      intent: { domain: "session", verb: "logout" },
      confidence: {
        label: "high",
        score: 0.96,
        reason: "matched a session logout pattern"
      }
    };
  }

  const verbResult = inferVerb(combinedTokens, input.method);
  const knownDomain = pickKnownDomain([...nameTokens, ...pathTokens, ...summaryTokens]);
  const domain = singularize(knownDomain ?? pickFallbackDomain([...nameTokens, ...pathTokens, ...summaryTokens]));
  const knownDomainMatch = Boolean(knownDomain);

  let score = 0.45;
  if (verbResult.known && knownDomainMatch) {
    score = 0.9;
  } else if (verbResult.known || knownDomainMatch) {
    score = 0.72;
  }

  return {
    key: `${domain}.${verbResult.verb}`,
    intent: { domain, verb: verbResult.verb },
    confidence: {
      label: score >= 0.85 ? "high" : score >= 0.65 ? "medium" : "low",
      score,
      reason: knownDomainMatch ? verbResult.reason : `${verbResult.reason}; the object fell back to a best-effort noun guess`
    }
  };
}

export function inferRisk(intent: AuraIntent, method: HttpMethod): AuraRisk {
  if (intent.domain === "payment" || intent.verb === "send" || intent.verb === "delete" || method === "DELETE") {
    return "high";
  }

  if (intent.verb === "publish" || intent.verb === "update" || method === "PUT" || method === "PATCH") {
    return "medium";
  }

  if (intent.verb === "create" && intent.domain !== "account" && method === "POST") {
    return "medium";
  }

  return "low";
}

export function inferConfirm(risk: AuraRisk): AuraConfirm {
  switch (risk) {
    case "high":
      return "required";
    case "medium":
      return "suggested";
    case "low":
      return "never";
  }
}
