import OpenAI from "openai";
import { z } from "zod";
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import type { ScrapedPage } from "./scrape";
import type { ExtractedLead, ExtractedContactDetails } from "../types";
import { isPlausibleEmail } from "../lib/email";

type CreateCompletion = (params: ChatCompletionCreateParamsNonStreaming) => Promise<ChatCompletion>;

export const leadSchema = z.object({
  isBusinessListing: z.boolean(),
  businessName: z.string().nullable(),
  location: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  description: z.string().nullable(),
  ownerName: z.string().nullable(),
  ownerTitle: z.string().nullable(),
});

// The OpenAI SDK's default timeout (10 minutes) is far longer than any user
// will wait — bounds one call's worst case rather than leaving it unbounded.
const GROQ_TIMEOUT_MS = 30_000;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not set. Copy .env.example to .env and fill it in.");
    }
    client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
      timeout: GROQ_TIMEOUT_MS,
    });
  }
  return client;
}

const SYSTEM_PROMPT = `You extract structured business contact information from raw webpage text.
Return ONLY a JSON object matching this shape, no prose, no markdown fences:
{
  "isBusinessListing": boolean,   // true only if this page is actually about a specific business
  "businessName": string | null,
  "location": string | null,      // city/region/address if mentioned
  "phone": string | null,
  "email": string | null,
  "website": string | null,       // the business's own site, if different from the source page
  "description": string | null,   // one short sentence describing the business
  "ownerName": string | null,     // name of the owner, founder, director, or a named contact person, if mentioned
  "ownerTitle": string | null     // that person's role/title (e.g. "Owner", "Founder", "Director"), if mentioned
}
If a field is not present in the text, use null. Never invent information.
If the page is not about a specific business (e.g. it's a directory listing many businesses,
a news article, or unrelated content), set isBusinessListing to false and use null for the rest.`;

/**
 * Sends scraped page text to the LLM and returns a validated lead, or null if
 * the page wasn't a usable business listing, the LLM call failed, or the
 * response didn't match the expected schema.
 */
export async function extractLead(
  page: ScrapedPage,
  createCompletion: CreateCompletion = (params) => getClient().chat.completions.create(params)
): Promise<ExtractedLead | null> {
  try {
    const completion = await createCompletion({
      model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Page title: ${page.title}\nPage URL: ${page.url}\n\nPage text:\n${page.text}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = leadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || !parsed.data.isBusinessListing || !parsed.data.businessName) {
      return null;
    }

    const { isBusinessListing: _drop, businessName, ...rest } = parsed.data;
    // Found live: the LLM once returned "[email protected]" — Cloudflare's
    // obfuscation placeholder text, not a real address — as if it were data
    // it actually read. Schema validation only checks shape (string |
    // null), not plausibility, so this filters it back to null rather than
    // storing garbage as a real contact email.
    return { businessName, ...rest, email: isPlausibleEmail(rest.email) ? rest.email : null };
  } catch {
    // Bad/invalid LLM output for a single page should never take down the whole search.
    return null;
  }
}

export const contactDetailsSchema = z.object({
  email: z.string().nullable(),
  // Phone isn't in Serper Places' structured data in every case (and a
  // CSV-imported candidate — see pipeline.ts's CSV import path — never has
  // it at all), so this is extracted the same way email is: from whatever
  // the business's own site actually publishes, as a fallback/supplement to
  // any structured source.
  phone: z.string().nullable(),
  description: z.string().nullable(),
  ownerName: z.string().nullable(),
  ownerTitle: z.string().nullable(),
});

const CONTACT_DETAILS_SYSTEM_PROMPT = `You are given the text of a business's own website. Extract only:
{
  "email": string | null,       // a contact email address, if present in the text
  "phone": string | null,       // a contact phone number, if present in the text
  "description": string | null, // one short sentence describing what the business does
  "ownerName": string | null,   // name of the owner, founder, director, or a named contact person, if mentioned
  "ownerTitle": string | null   // that person's role/title (e.g. "Owner", "Founder", "Director"), if mentioned
}
Return ONLY the JSON object, no prose, no markdown fences. If a field is not present, use null. Never invent information.`;

/**
 * Used for candidates whose business identity is already known (Serper
 * Places, or a CSV-imported business name+website — see pipeline.ts) — we
 * don't need the LLM to judge whether the page is a business listing, only
 * to pull out contact details the known source didn't already provide.
 */
export async function extractContactDetails(
  page: ScrapedPage,
  createCompletion: CreateCompletion = (params) => getClient().chat.completions.create(params)
): Promise<ExtractedContactDetails | null> {
  try {
    const completion = await createCompletion({
      model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CONTACT_DETAILS_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Page title: ${page.title}\nPage URL: ${page.url}\n\nPage text:\n${page.text}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = contactDetailsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    // See extractLead's identical filter above for why.
    return { ...parsed.data, email: isPlausibleEmail(parsed.data.email) ? parsed.data.email : null };
  } catch {
    return null;
  }
}
