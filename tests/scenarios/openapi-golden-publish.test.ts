import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveDocument, publishDocument } from "../../packages/aura-protocol/src";
import { writeJsonFile } from "../../packages/aura-protocol/src/filesystem";
import { ROOT, createScenarioTempDir, readJson, removeDirectory } from "./helpers";

describe("Scenario J - OpenAPI golden publish", () => {
  it("keeps the minimal OpenAPI derive/publish story locked to the expected release artifact shape", () => {
    const fixturePath = path.join(ROOT, "examples", "minimal-site", "source", "openapi.json");
    const fixture = readJson<unknown>(fixturePath);
    const document = deriveDocument(fixture);
    const scenarioRoot = createScenarioTempDir("aura-scenario-j-");

    try {
      const derivedPath = path.join(scenarioRoot, "dist", ".derived", "aura-v2.json");
      writeJsonFile(derivedPath, document);
      const derivedArtifact = readJson<{
        actions: Array<Record<string, unknown> & { id: string }>;
      }>(derivedPath);
      expect(derivedArtifact).toEqual({
        $schema: "https://raw.githubusercontent.com/osmandkitay/aura/v2.0.0-alpha.1/packages/aura-protocol/schema/aura-v2.schema.json",
        protocol: "AURA",
        version: "2.0",
        site: {
          name: "Minimal Site",
          url: "https://minimal.example.com",
          description: "A tiny action surface for publishing posts."
        },
        source: {
          kind: "openapi"
        },
        actions: [
          {
            id: "post.list",
            key: "post.list",
            title: "List published posts",
            intent: { domain: "post", verb: "list" },
            entrypoint: {
              type: "http",
              method: "GET",
              path: "/posts",
              encoding: "query",
              parameterLocation: { tag: "query" },
              parameterMapping: { tag: "/tag" }
            },
            confirm: "never",
            risk: "low",
            input: {
              type: "object",
              properties: {
                tag: { type: "string" }
              }
            },
            result: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  title: { type: "string" }
                }
              }
            },
            docs: { summary: "List published posts" },
            aliases: ["GET /posts", "listPosts"],
            origin: {
              source: "openapi",
              path: "/posts",
              operationId: "listPosts",
              method: "GET",
              ref: "#/paths/~1posts/get",
              summary: "List published posts"
            },
            confidence: {
              label: "high",
              score: 0.9,
              reason: "matched listing vocabulary"
            }
          },
          {
            id: "post.publish",
            key: "post.publish",
            title: "Publish a new post",
            intent: { domain: "post", verb: "publish" },
            entrypoint: {
              type: "http",
              method: "POST",
              path: "/posts",
              encoding: "json",
              parameterLocation: { content: "body", title: "body" },
              parameterMapping: { content: "/content", title: "/title" }
            },
            confirm: "suggested",
            risk: "medium",
            input: {
              type: "object",
              properties: {
                content: { type: "string" },
                title: { type: "string" }
              },
              required: ["content", "title"]
            },
            result: {
              type: "object",
              properties: {
                id: { type: "string" }
              }
            },
            docs: { summary: "Publish a new post" },
            aliases: ["POST /posts", "publishPost"],
            origin: {
              source: "openapi",
              path: "/posts",
              operationId: "publishPost",
              method: "POST",
              ref: "#/paths/~1posts/post",
              summary: "Publish a new post"
            },
            confidence: {
              label: "high",
              score: 0.9,
              reason: "matched publish vocabulary"
            }
          },
          {
            id: "session.login",
            key: "session.login",
            title: "Log in to a session",
            intent: { domain: "session", verb: "login" },
            entrypoint: {
              type: "http",
              method: "POST",
              path: "/session/login",
              encoding: "json",
              parameterLocation: { email: "body", password: "body" },
              parameterMapping: { email: "/email", password: "/password" }
            },
            auth: { kind: "none", required: false },
            confirm: "never",
            risk: "low",
            input: {
              type: "object",
              properties: {
                email: { type: "string" },
                password: { type: "string" }
              },
              required: ["email", "password"]
            },
            docs: { summary: "Log in to a session" },
            aliases: ["POST /session/login", "loginUser"],
            origin: {
              source: "openapi",
              path: "/session/login",
              operationId: "loginUser",
              method: "POST",
              ref: "#/paths/~1session~1login/post",
              summary: "Log in to a session"
            },
            confidence: {
              label: "high",
              score: 0.96,
              reason: "matched a session login pattern"
            }
          }
        ]
      });

      const published = publishDocument(document, path.join(scenarioRoot, "dist"));
      expect(published.index).toEqual({
        $schema: "https://raw.githubusercontent.com/osmandkitay/aura/v2.0.0-alpha.1/packages/aura-protocol/schema/aura-publish.schema.json",
        protocol: "AURA",
        version: "2.0",
        site: {
          name: "Minimal Site",
          url: "https://minimal.example.com",
          description: "A tiny action surface for publishing posts."
        },
        actions: [
          {
            id: "post.list",
            key: "post.list",
            title: "List published posts",
            intent: { domain: "post", verb: "list" },
            href: "/.well-known/aura/actions/post.list.json",
            confirm: "never",
            risk: "low"
          },
          {
            id: "post.publish",
            key: "post.publish",
            title: "Publish a new post",
            intent: { domain: "post", verb: "publish" },
            href: "/.well-known/aura/actions/post.publish.json",
            confirm: "suggested",
            risk: "medium"
          },
          {
            id: "session.login",
            key: "session.login",
            title: "Log in to a session",
            intent: { domain: "session", verb: "login" },
            href: "/.well-known/aura/actions/session.login.json",
            auth: { kind: "none", required: false },
            confirm: "never",
            risk: "low"
          }
        ]
      });

      for (const action of derivedArtifact.actions) {
        const detailPath = path.join(scenarioRoot, "dist", ".well-known", "aura", "actions", `${action.id}.json`);
        expect(fs.existsSync(detailPath)).toBe(true);
        expect(readJson(detailPath)).toEqual({
          $schema: "https://raw.githubusercontent.com/osmandkitay/aura/v2.0.0-alpha.1/packages/aura-protocol/schema/aura-action.schema.json",
          ...action
        });
      }
    } finally {
      removeDirectory(scenarioRoot);
    }
  });
});
