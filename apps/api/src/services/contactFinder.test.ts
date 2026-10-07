import { describe, expect, test } from "bun:test";
import { findContactDetails } from "./contactFinder";
import type { ScrapedPage } from "./scrape";
import type { ExtractedContactDetails } from "../types";

function page(url: string, socialLinks: ScrapedPage["socialLinks"] = {}, pageEmail: string | null = null): ScrapedPage {
  return { url, title: "Title", text: "text", socialLinks, pageEmail, logoUrl: null };
}

describe("findContactDetails", () => {
  test("returns immediately when the homepage already has an email, without trying fallback pages", async () => {
    const scraped: string[] = [];
    const scrape = async (url: string) => {
      scraped.push(url);
      return page(url);
    };
    const extract = async (): Promise<ExtractedContactDetails> => ({
      email: "info@business.com",
      phone: null,
      description: "A business.",
      ownerName: null,
      ownerTitle: null,
    });

    const result = await findContactDetails("https://business.com", scrape, extract);

    expect(scraped).toEqual(["https://business.com"]);
    expect(result?.contactDetails?.email).toBe("info@business.com");
    expect(result?.scrapedUrl).toBe("https://business.com");
  });

  test("falls back to /contact when the homepage has no email, and stops there once found", async () => {
    const scraped: string[] = [];
    const scrape = async (url: string) => {
      scraped.push(url);
      return page(url);
    };
    const extract = async (p: ScrapedPage): Promise<ExtractedContactDetails> =>
      p.url.endsWith("/contact")
        ? { email: "sales@business.com", phone: null, description: null, ownerName: "Jane Doe", ownerTitle: "Owner" }
        : { email: null, phone: null, description: "Homepage description.", ownerName: null, ownerTitle: null };

    const result = await findContactDetails("https://business.com", scrape, extract);

    expect(scraped).toEqual(["https://business.com", "https://business.com/contact"]);
    expect(result?.contactDetails?.email).toBe("sales@business.com");
    // Homepage's description is preferred over the (usually empty) contact page's.
    expect(result?.contactDetails?.description).toBe("Homepage description.");
    expect(result?.contactDetails?.ownerName).toBe("Jane Doe");
    expect(result?.scrapedUrl).toBe("https://business.com/contact");
  });

  test("tries every fallback path in order and returns the homepage result if none has an email", async () => {
    const scraped: string[] = [];
    const scrape = async (url: string) => {
      scraped.push(url);
      return page(url);
    };
    const extract = async (): Promise<ExtractedContactDetails> => ({
      email: null,
      phone: null,
      description: null,
      ownerName: null,
      ownerTitle: null,
    });

    const result = await findContactDetails("https://business.com", scrape, extract);

    expect(scraped).toEqual([
      "https://business.com",
      "https://business.com/contact",
      "https://business.com/contact-us",
      "https://business.com/about",
    ]);
    expect(result?.contactDetails?.email).toBeNull();
    expect(result?.scrapedUrl).toBe("https://business.com");
  });

  test("skips a fallback path that fails to scrape (404/timeout) and continues to the next", async () => {
    const scraped: string[] = [];
    const scrape = async (url: string) => {
      scraped.push(url);
      if (url.endsWith("/contact")) return null; // simulate 404
      return page(url);
    };
    const extract = async (p: ScrapedPage): Promise<ExtractedContactDetails> =>
      p.url.endsWith("/contact-us")
        ? { email: "hello@business.com", phone: null, description: null, ownerName: null, ownerTitle: null }
        : { email: null, phone: null, description: null, ownerName: null, ownerTitle: null };

    const result = await findContactDetails("https://business.com", scrape, extract);

    expect(scraped).toEqual([
      "https://business.com",
      "https://business.com/contact",
      "https://business.com/contact-us",
    ]);
    expect(result?.contactDetails?.email).toBe("hello@business.com");
  });

  test("returns null when the homepage itself is unreachable", async () => {
    const scrape = async () => null;
    const extract = async (): Promise<ExtractedContactDetails> => ({
      email: null,
      phone: null,
      description: null,
      ownerName: null,
      ownerTitle: null,
    });

    const result = await findContactDetails("https://doesnotexist.example", scrape, extract);
    expect(result).toBeNull();
  });

  test("uses a homepage mailto: link as the email when the LLM extraction missed it, without trying fallback pages", async () => {
    // Simulates an icon-only "envelope" mailto button: the href has the
    // email but there's no visible email text for the LLM to read.
    const scraped: string[] = [];
    const scrape = async (url: string) => {
      scraped.push(url);
      return page(url, {}, "hello@business.com");
    };
    const extract = async (): Promise<ExtractedContactDetails> => ({
      email: null,
      phone: null,
      description: "Homepage description.",
      ownerName: null,
      ownerTitle: null,
    });

    const result = await findContactDetails("https://business.com", scrape, extract);

    expect(scraped).toEqual(["https://business.com"]);
    expect(result?.contactDetails?.email).toBe("hello@business.com");
    expect(result?.contactDetails?.description).toBe("Homepage description.");
    expect(result?.scrapedUrl).toBe("https://business.com");
  });

  test("uses a fallback page's mailto: link when neither the homepage nor the LLM extraction found an email", async () => {
    const scrape = async (url: string) => {
      if (url.endsWith("/contact")) return page(url, {}, "sales@business.com");
      return page(url);
    };
    const extract = async (): Promise<ExtractedContactDetails> => ({
      email: null,
      phone: null,
      description: null,
      ownerName: null,
      ownerTitle: null,
    });

    const result = await findContactDetails("https://business.com", scrape, extract);

    expect(result?.contactDetails?.email).toBe("sales@business.com");
    expect(result?.scrapedUrl).toBe("https://business.com/contact");
  });

  test("keeps a phone number found on a fallback page even though that page didn't have the email", async () => {
    const scrape = async (url: string) => {
      if (url.endsWith("/contact")) return page(url);
      return page(url);
    };
    const extract = async (p: ScrapedPage): Promise<ExtractedContactDetails> => {
      if (p.url.endsWith("/contact")) {
        return { email: "sales@business.com", phone: null, description: null, ownerName: null, ownerTitle: null };
      }
      // Homepage has no email (triggers the fallback loop) but does have a phone.
      return { email: null, phone: "+61 2 9189 4164", description: null, ownerName: null, ownerTitle: null };
    };

    const result = await findContactDetails("https://business.com", scrape, extract);

    expect(result?.contactDetails?.email).toBe("sales@business.com");
    expect(result?.contactDetails?.phone).toBe("+61 2 9189 4164");
  });

  test("merges social links picked up across homepage and fallback pages, even when no email is ever found", async () => {
    const scrape = async (url: string) => {
      if (url.endsWith("/contact")) return page(url, { instagram: "https://instagram.com/business" });
      return page(url, { facebook: "https://facebook.com/business" });
    };
    const extract = async (): Promise<ExtractedContactDetails> => ({
      email: null,
      phone: null,
      description: null,
      ownerName: null,
      ownerTitle: null,
    });

    const result = await findContactDetails("https://business.com", scrape, extract);

    expect(result?.contactDetails?.socialLinks).toEqual({
      facebook: "https://facebook.com/business",
      instagram: "https://instagram.com/business",
    });
  });
});
