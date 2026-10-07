import { describe, expect, test } from "bun:test";
import { leadSchema, contactDetailsSchema, extractLead, extractContactDetails } from "./extract";
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import type { ScrapedPage } from "./scrape";

function fakePage(overrides: Partial<ScrapedPage> = {}): ScrapedPage {
  return { url: "https://clean-co.example", title: "Clean Co", text: "some page text", socialLinks: {}, pageEmail: null, logoUrl: null, ...overrides };
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

describe("leadSchema (full extraction, DuckDuckGo path)", () => {
  test("accepts a well-formed business listing", () => {
    const result = leadSchema.safeParse({
      isBusinessListing: true,
      businessName: "Clean Co",
      location: "Sydney NSW",
      phone: "+61 2 9189 4164",
      email: "info@clean-co.com.au",
      website: "https://commercial-cleaning.com.au",
      description: "Commercial cleaning in Sydney.",
      ownerName: "Jane Smith",
      ownerTitle: "Owner",
    });
    expect(result.success).toBe(true);
  });

  test("accepts nulls for missing fields", () => {
    const result = leadSchema.safeParse({
      isBusinessListing: true,
      businessName: "Clean Co",
      location: null,
      phone: null,
      email: null,
      website: null,
      description: null,
      ownerName: null,
      ownerTitle: null,
    });
    expect(result.success).toBe(true);
  });

  test("rejects a payload missing required keys — this is what makes malformed LLM output a no-op page skip, not a crash", () => {
    const result = leadSchema.safeParse({ businessName: "Clean Co" });
    expect(result.success).toBe(false);
  });

  test("rejects wrong types (e.g. isBusinessListing as a string, a plausible LLM slip)", () => {
    const result = leadSchema.safeParse({
      isBusinessListing: "true",
      businessName: "Clean Co",
      location: null,
      phone: null,
      email: null,
      website: null,
      description: null,
      ownerName: null,
      ownerTitle: null,
    });
    expect(result.success).toBe(false);
  });

  test("non-business pages parse but are identifiable as non-listings via isBusinessListing:false", () => {
    const result = leadSchema.safeParse({
      isBusinessListing: false,
      businessName: null,
      location: null,
      phone: null,
      email: null,
      website: null,
      description: null,
      ownerName: null,
      ownerTitle: null,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.isBusinessListing).toBe(false);
  });
});

describe("contactDetailsSchema (Places/CSV path — email/phone/description/owner only)", () => {
  test("accepts an email, phone, description, and owner details", () => {
    const result = contactDetailsSchema.safeParse({
      email: "info@clean-co.com.au",
      phone: "+61 2 9189 4164",
      description: "Commercial cleaning in Sydney.",
      ownerName: "Jane Smith",
      ownerTitle: "Founder",
    });
    expect(result.success).toBe(true);
  });

  test("accepts nulls when nothing was found on the page", () => {
    const result = contactDetailsSchema.safeParse({
      email: null,
      phone: null,
      description: null,
      ownerName: null,
      ownerTitle: null,
    });
    expect(result.success).toBe(true);
  });

  test("rejects a payload missing required keys", () => {
    const result = contactDetailsSchema.safeParse({ email: null, description: null });
    expect(result.success).toBe(false);
  });

  test("rejects a non-JSON-shaped / garbage payload", () => {
    const result = contactDetailsSchema.safeParse("not an object");
    expect(result.success).toBe(false);
  });
});

// Found live: the LLM once returned "[email protected]" — Cloudflare's
// obfuscation placeholder text — as if it were a real extracted email.
// Schema validation alone can't catch this (it's a syntactically fine
// string), so both extraction functions filter the email field through
// isPlausibleEmail after parsing. These exercise that filter directly via
// an injected fake completion, without a real LLM call.
describe("extractContactDetails filters implausible emails from the LLM", () => {
  test("passes through a well-formed email unchanged", async () => {
    const createCompletion = async (_p: ChatCompletionCreateParamsNonStreaming) =>
      completionWith(
        JSON.stringify({ email: "info@clean-co.example", phone: null, description: null, ownerName: null, ownerTitle: null })
      );
    const result = await extractContactDetails(fakePage(), createCompletion);
    expect(result?.email).toBe("info@clean-co.example");
  });

  test("nulls out Cloudflare's obfuscation placeholder text", async () => {
    const createCompletion = async () =>
      completionWith(
        JSON.stringify({ email: "[email protected]", phone: null, description: null, ownerName: null, ownerTitle: null })
      );
    const result = await extractContactDetails(fakePage(), createCompletion);
    expect(result?.email).toBeNull();
  });

  test("extracts a phone number from the page text", async () => {
    const createCompletion = async () =>
      completionWith(
        JSON.stringify({ email: null, phone: "+61 2 9189 4164", description: null, ownerName: null, ownerTitle: null })
      );
    const result = await extractContactDetails(fakePage(), createCompletion);
    expect(result?.phone).toBe("+61 2 9189 4164");
  });
});

describe("extractLead filters implausible emails from the LLM", () => {
  test("nulls out Cloudflare's obfuscation placeholder text", async () => {
    const createCompletion = async () =>
      completionWith(
        JSON.stringify({
          isBusinessListing: true,
          businessName: "Clean Co",
          location: null,
          phone: null,
          email: "[email protected]",
          website: null,
          description: null,
          ownerName: null,
          ownerTitle: null,
        })
      );
    const result = await extractLead(fakePage(), createCompletion);
    expect(result?.email).toBeNull();
  });
});
