import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { handleWebhookCommand } from "../src/webhook";
import { loadStatusNotes, saveStatusNotes } from "../src/status-notes";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import type { OrchestratorConfig } from "../src/types";

const TEST_OUTPUT_DIR = join(import.meta.dir, ".test-output");

const testConfig: OrchestratorConfig = {
  outputDir: TEST_OUTPUT_DIR,
  stalenessThresholdDays: 7,
  projects: [
    {
      name: "Praxor Orchestrator",
      repo: "leongcheefai/praxor-orchestrator",
      branch: "master",
      type: "micro-tool",
      platform: "cli",
      status: "active",
      description: "Test project",
      priority: "medium",
    },
    {
      name: "praxor",
      repo: "leongcheefai/praxor",
      branch: "main",
      type: "saas",
      platform: "web",
      status: "active",
      description: "Another project",
      priority: "low",
    },
    {
      name: "Offero",
      repo: "leongcheefai/offero",
      branch: "master",
      type: "saas",
      platform: "web",
      status: "active",
      description: "Test",
      priority: "high",
    },
  ],
};

beforeEach(() => {
  if (existsSync(TEST_OUTPUT_DIR)) {
    rmSync(TEST_OUTPUT_DIR, { recursive: true });
  }
  mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_OUTPUT_DIR)) {
    rmSync(TEST_OUTPUT_DIR, { recursive: true });
  }
});

describe("handleWebhookCommand", () => {
  describe("/update", () => {
    test("saves a note for a single-word project", async () => {
      const reply = await handleWebhookCommand("/update Offero shipped auth", testConfig, TEST_OUTPUT_DIR);
      expect(reply).toContain("Offero");
      expect(reply).toContain("shipped auth");

      const store = loadStatusNotes(TEST_OUTPUT_DIR);
      expect(store.notes).toHaveLength(1);
      expect(store.notes[0].project).toBe("Offero");
      expect(store.notes[0].message).toBe("shipped auth");
    });

    test("saves a note for multi-word project name", async () => {
      const reply = await handleWebhookCommand(
        "/update Praxor Orchestrator integrated with Claude AI",
        testConfig,
        TEST_OUTPUT_DIR
      );
      expect(reply).toContain("Praxor Orchestrator");

      const store = loadStatusNotes(TEST_OUTPUT_DIR);
      expect(store.notes).toHaveLength(1);
      expect(store.notes[0].project).toBe("Praxor Orchestrator");
      expect(store.notes[0].message).toBe("integrated with Claude AI");
    });

    test("handles misspelled project name with dash separator", async () => {
      // User types "Praxor Orchestator" (misspelled) with a dash separator
      const reply = await handleWebhookCommand(
        "/update Praxor Orchestator - integrate with Claude AI",
        testConfig,
        TEST_OUTPUT_DIR
      );

      expect(reply).toContain("Praxor Orchestrator");

      const store = loadStatusNotes(TEST_OUTPUT_DIR);
      expect(store.notes).toHaveLength(1);
      // Should fuzzy-match "Praxor Orchestrator" via " - " separator + Levenshtein
      expect(store.notes[0].project).toBe("Praxor Orchestrator");
      expect(store.notes[0].message).toBe("integrate with Claude AI");
    });

    test("handles dash separator with correct project name", async () => {
      const reply = await handleWebhookCommand(
        "/update Praxor Orchestrator - shipped new feature",
        testConfig,
        TEST_OUTPUT_DIR
      );

      expect(reply).toContain("Praxor Orchestrator");

      const store = loadStatusNotes(TEST_OUTPUT_DIR);
      expect(store.notes).toHaveLength(1);
      expect(store.notes[0].project).toBe("Praxor Orchestrator");
      expect(store.notes[0].message).toBe("shipped new feature");
    });

    test("returns error for unknown project", async () => {
      const reply = await handleWebhookCommand("/update UnknownProject test", testConfig, TEST_OUTPUT_DIR);
      expect(reply).toContain("Could not resolve project");
    });

    test("returns usage when no message provided", async () => {
      const reply = await handleWebhookCommand("/update Offero", testConfig, TEST_OUTPUT_DIR);
      expect(reply).toContain("Usage");
    });
  });

  describe("/notes", () => {
    test("returns empty message when no notes", async () => {
      const reply = await handleWebhookCommand("/notes", testConfig, TEST_OUTPUT_DIR);
      expect(reply).toContain("No status notes");
    });

    test("shows notes after update", async () => {
      await handleWebhookCommand("/update Offero shipped auth feature", testConfig, TEST_OUTPUT_DIR);
      const reply = await handleWebhookCommand("/notes", testConfig, TEST_OUTPUT_DIR);
      expect(reply).toContain("Offero");
      expect(reply).toContain("shipped auth feature");
    });

    test("shows multiple notes", async () => {
      await handleWebhookCommand("/update Offero shipped auth", testConfig, TEST_OUTPUT_DIR);
      await handleWebhookCommand("/update praxor added tests", testConfig, TEST_OUTPUT_DIR);
      const reply = await handleWebhookCommand("/notes", testConfig, TEST_OUTPUT_DIR);
      expect(reply).toContain("Offero");
      expect(reply).toContain("praxor");
    });
  });

  describe("/clear", () => {
    test("clears notes for a project", async () => {
      await handleWebhookCommand("/update Offero shipped auth", testConfig, TEST_OUTPUT_DIR);
      const clearReply = await handleWebhookCommand("/clear Offero", testConfig, TEST_OUTPUT_DIR);
      expect(clearReply).toContain("Cleared");

      const notesReply = await handleWebhookCommand("/notes", testConfig, TEST_OUTPUT_DIR);
      expect(notesReply).toContain("No status notes");
    });
  });

  describe("/status", () => {
    test("returns status count", async () => {
      const reply = await handleWebhookCommand("/status", testConfig, TEST_OUTPUT_DIR);
      expect(reply).toContain("0 status notes");
    });
  });

  describe("unknown command", () => {
    test("returns help for unknown commands", async () => {
      const reply = await handleWebhookCommand("/unknown", testConfig, TEST_OUTPUT_DIR);
      expect(reply).toContain("Unknown command");
    });
  });

  describe("bot name suffix", () => {
    test("strips @botname from commands", async () => {
      const reply = await handleWebhookCommand("/notes@PraxorBot", testConfig, TEST_OUTPUT_DIR);
      expect(reply).toContain("No status notes");
    });
  });
});
