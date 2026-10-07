import { describe, expect, test } from "bun:test";
import { qualifyLead, qualificationSchema, normalizeOffering } from "./qualifyLeads";
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import type { Lead } from "../db/schema";

function fakeLead(overrides: Partial<Lead> = {}): Pick<
  Lead,
  | "businessName"
  | "description"
  | "location"
  | "website"
  | "email"
  | "isRoleBasedEmail"
  | "phone"
  | "socialLinks"
  | "ownerName"
  | "ownerTitle"
> {
  return {
    businessName: "Clean Co",
    description: "Commercial cleaning services.",
    location: "Sydney NSW",
    website: null,
    email: null,
    isRoleBasedEmail: null,
    phone: "+61 2 9189 4164",
    socialLinks: {},
    ownerName: null,
    ownerTitle: null,
    ...overrides,
  };
}

function completionWith(content: string): ChatCompletion {
  return {
    id: "fake",
    object: "chat.completion",
    created: 0,
    model: "fake",
    choices: [
      { index: 0, finish_reason: "stop", logprobs: null, message: { role: "assistant", content, refusal: null } },
    ],
  } as unknown as ChatCompletion;
}

describe("normalizeOffering", () => {
  test("trims and lowercases", () => {
    expect(normalizeOffering("  Web Design Services  ")).toBe("web design services");
  });
});

describe("qualificationSchema", () => {
  test("accepts a well-formed qualification", () => {
    const result = qualificationSchema.safeParse({
      fitScore: "strong_fit",
      reasoning: "No website found.",
      opener: "Noticed Clean Co doesn't have a website yet.",
    });
    expect(result.success).toBe(true);
  });

  test("accepts a null opener — the expected shape for a poor_fit lead not worth contacting", () => {
    const result = qualificationSchema.safeParse({
      fitScore: "poor_fit",
      reasoning: "Not a relevant business type for this offering.",
      opener: null,
    });
    expect(result.success).toBe(true);
  });

  test("rejects an invalid fitScore value", () => {
    const result = qualificationSchema.safeParse({ fitScore: "amazing_fit", reasoning: "...", opener: "..." });
    expect(result.success).toBe(false);
  });

  test("rejects a payload missing reasoning", () => {
    const result = qualificationSchema.safeParse({ fitScore: "poor_fit", opener: "..." });
    expect(result.success).toBe(false);
  });

  test("rejects a payload missing opener", () => {
    const result = qualificationSchema.safeParse({ fitScore: "poor_fit", reasoning: "..." });
    expect(result.success).toBe(false);
  });
});

describe("qualifyLead", () => {
  test("returns a parsed qualification on a well-formed response", async () => {
    const createCompletion = async (_params: ChatCompletionCreateParamsNonStreaming) =>
      completionWith(
        JSON.stringify({
          fitScore: "strong_fit",
          reasoning: "No website listed for a web design offering.",
          opener: "Noticed Clean Co doesn't have a website yet — worth a quick chat?",
        })
      );

    const result = await qualifyLead(fakeLead(), "web design services", createCompletion);

    expect(result).toEqual({
      fitScore: "strong_fit",
      reasoning: "No website listed for a web design offering.",
      opener: "Noticed Clean Co doesn't have a website yet — worth a quick chat?",
    });
  });

  test("returns null when the response isn't valid JSON, rather than throwing", async () => {
    const createCompletion = async () => completionWith("not json at all");
    const result = await qualifyLead(fakeLead(), "web design services", createCompletion);
    expect(result).toBeNull();
  });

  test("returns null when the response doesn't match the schema, rather than throwing", async () => {
    const createCompletion = async () => completionWith(JSON.stringify({ fitScore: "definitely", reasoning: "..." }));
    const result = await qualifyLead(fakeLead(), "web design services", createCompletion);
    expect(result).toBeNull();
  });

  test("returns null when the completion call itself throws, rather than propagating", async () => {
    const createCompletion = async () => {
      throw new Error("network error");
    };
    const result = await qualifyLead(fakeLead(), "web design services", createCompletion);
    expect(result).toBeNull();
  });

  test("returns null when the response has no content", async () => {
    const createCompletion = async () =>
      ({
        id: "fake",
        object: "chat.completion",
        created: 0,
        model: "fake",
        choices: [{ index: 0, finish_reason: "stop", logprobs: null, message: { role: "assistant", content: null, refusal: null } }],
      }) as unknown as ChatCompletion;
    const result = await qualifyLead(fakeLead(), "web design services", createCompletion);
    expect(result).toBeNull();
  });

  test("includes the offering and the lead's facts in the prompt sent to the model", async () => {
    let capturedContent = "";
    const createCompletion = async (params: ChatCompletionCreateParamsNonStreaming) => {
      const userMessage = params.messages.find((m) => m.role === "user");
      capturedContent = String(userMessage?.content ?? "");
      return completionWith(JSON.stringify({ fitScore: "possible_fit", reasoning: "ok", opener: "ok" }));
    };

    await qualifyLead(
      fakeLead({ businessName: "Acme Plumbing", website: "https://acme-plumbing.example", email: "info@acme.example" }),
      "SEO services",
      createCompletion
    );

    expect(capturedContent).toContain("SEO services");
    expect(capturedContent).toContain("Acme Plumbing");
    expect(capturedContent).toContain("Has a website: yes");
    expect(capturedContent).toContain("Has a public email listed: yes");
  });

  test("includes the owner/contact name in the prompt when present, so the opener can address them by name", async () => {
    let capturedContent = "";
    const createCompletion = async (params: ChatCompletionCreateParamsNonStreaming) => {
      const userMessage = params.messages.find((m) => m.role === "user");
      capturedContent = String(userMessage?.content ?? "");
      return completionWith(JSON.stringify({ fitScore: "possible_fit", reasoning: "ok", opener: "ok" }));
    };

    await qualifyLead(
      fakeLead({ ownerName: "Jane Smith", ownerTitle: "Owner" }),
      "web design services",
      createCompletion
    );

    expect(capturedContent).toContain("Owner/contact name: Jane Smith (Owner)");
  });

  test("omits the owner/contact name line entirely when not present", async () => {
    let capturedContent = "";
    const createCompletion = async (params: ChatCompletionCreateParamsNonStreaming) => {
      const userMessage = params.messages.find((m) => m.role === "user");
      capturedContent = String(userMessage?.content ?? "");
      return completionWith(JSON.stringify({ fitScore: "possible_fit", reasoning: "ok", opener: "ok" }));
    };

    await qualifyLead(fakeLead({ ownerName: null }), "web design services", createCompletion);

    expect(capturedContent).not.toContain("Owner/contact name");
  });
});
