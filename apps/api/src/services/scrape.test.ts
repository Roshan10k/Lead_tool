import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { scrapePage } from "./scrape";

// A local test server, rather than hitting a real external site, so this
// test is deterministic and doesn't depend on network conditions or a third
// party's page staying online/unchanged.
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/business") {
        return new Response(
          `<html><head><title>Clean Co</title></head><body>
            <script>console.log("should be stripped")</script>
            <nav>nav should be stripped</nav>
            Contact us: info@clean-co.example
          </body></html>`,
          { headers: { "content-type": "text/html" } }
        );
      }
      if (url.pathname === "/with-social") {
        return new Response(
          `<html><head><title>Clean Co</title></head><body>
            <nav>
              <a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a>
            </nav>
            Contact us: info@clean-co.example
            <footer>
              <a href="https://www.facebook.com/cleanco">Facebook</a>
              <a href="https://instagram.com/cleanco/">Instagram</a>
              <a href="https://www.linkedin.com/company/cleanco">LinkedIn</a>
              <a href="https://x.com/cleanco">X</a>
              <a href="https://facebook.com/policies/cookies">Cookie policy</a>
            </footer>
          </body></html>`,
          { headers: { "content-type": "text/html" } }
        );
      }
      if (url.pathname === "/no-social") {
        return new Response(
          `<html><head><title>Clean Co</title></head><body>No social links here.</body></html>`,
          { headers: { "content-type": "text/html" } }
        );
      }
      if (url.pathname === "/mailto-icon-only") {
        return new Response(
          `<html><head><title>Clean Co</title></head><body>
            Welcome to Clean Co.
            <a href="mailto:hello@clean-co.example?subject=Hi"><svg>envelope icon</svg></a>
          </body></html>`,
          { headers: { "content-type": "text/html" } }
        );
      }
      if (url.pathname === "/mailto-malformed") {
        return new Response(
          `<html><head><title>Clean Co</title></head><body>
            Welcome to Clean Co.
            <a href="mailto:contact@clean-co.example subject=complaints">Email us</a>
          </body></html>`,
          { headers: { "content-type": "text/html" } }
        );
      }
      if (url.pathname === "/cloudflare-email") {
        // "2a594b464f596a4f524b475a464f04494547" XOR-decodes (key 0x2a) to
        // "sales@example.com" — the same encoding real Cloudflare-protected
        // sites use. Placed inside <footer> deliberately: that's where it
        // was found live on a real site, and it must still be caught even
        // though footer content gets stripped before the LLM ever sees it.
        return new Response(
          `<html><head><title>Clean Co</title></head><body>
            Welcome to Clean Co.
            <footer>
              <a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="2a594b464f596a4f524b475a464f04494547">[email&#160;protected]</a>
            </footer>
          </body></html>`,
          { headers: { "content-type": "text/html" } }
        );
      }
      if (url.pathname === "/cloudflare-email-malformed") {
        return new Response(
          `<html><head><title>Clean Co</title></head><body>
            Welcome to Clean Co.
            <a class="__cf_email__" data-cfemail="not-valid-hex">[email protected]</a>
          </body></html>`,
          { headers: { "content-type": "text/html" } }
        );
      }
      if (url.pathname === "/logo-multiple-icons") {
        return new Response(
          `<html><head><title>Clean Co</title>
            <link rel="icon" href="/favicon-32x32.png" sizes="32x32" />
            <link rel="icon" href="/favicon-192x192.png" sizes="192x192" />
            <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
          </head><body>Welcome to Clean Co.</body></html>`,
          { headers: { "content-type": "text/html" } }
        );
      }
      if (url.pathname === "/logo-relative-path") {
        return new Response(
          `<html><head><title>Clean Co</title>
            <link rel="shortcut icon" href="images/favicon.ico" />
          </head><body>Welcome to Clean Co.</body></html>`,
          { headers: { "content-type": "text/html" } }
        );
      }
      if (url.pathname === "/logo-none-declared") {
        return new Response(
          `<html><head><title>Clean Co</title></head><body>Welcome to Clean Co, no icon links at all.</body></html>`,
          { headers: { "content-type": "text/html" } }
        );
      }
      if (url.pathname === "/not-found") {
        return new Response("nope", { status: 404 });
      }
      if (url.pathname === "/json") {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });
});

afterAll(() => {
  server.stop(true);
});

describe("scrapePage", () => {
  test("extracts title and visible text, stripping script/nav content", async () => {
    const page = await scrapePage(`${server.url}business`);
    expect(page).not.toBeNull();
    expect(page?.title).toBe("Clean Co");
    expect(page?.text).toContain("info@clean-co.example");
    expect(page?.text).not.toContain("should be stripped");
  });

  test("returns null for a failed page (404) rather than throwing — one bad URL must not crash the whole search", async () => {
    const page = await scrapePage(`${server.url}not-found`);
    expect(page).toBeNull();
  });

  test("returns null for non-HTML content types", async () => {
    const page = await scrapePage(`${server.url}json`);
    expect(page).toBeNull();
  });

  test("returns null for an unreachable host rather than throwing", async () => {
    const page = await scrapePage("http://localhost:1/unreachable");
    expect(page).toBeNull();
  });
});

describe("scrapePage social link extraction", () => {
  test("extracts social links from the footer, which script/nav/footer text-stripping would otherwise remove first", async () => {
    const page = await scrapePage(`${server.url}with-social`);
    expect(page?.socialLinks.facebook).toBe("https://www.facebook.com/cleanco");
    expect(page?.socialLinks.instagram).toBe("https://instagram.com/cleanco/");
    expect(page?.socialLinks.linkedin).toBe("https://www.linkedin.com/company/cleanco");
    expect(page?.socialLinks.twitter).toBe("https://x.com/cleanco");
  });

  test("excludes utility paths (share dialogs, policy pages) rather than mistaking them for a profile link", async () => {
    const page = await scrapePage(`${server.url}with-social`);
    // The sharer.php link in <nav> and the /policies/ link in <footer> must
    // not overwrite the real facebook.com/cleanco profile link.
    expect(page?.socialLinks.facebook).toBe("https://www.facebook.com/cleanco");
  });

  test("returns an empty object when a page has no social links, not undefined/null", async () => {
    const page = await scrapePage(`${server.url}no-social`);
    expect(page?.socialLinks).toEqual({});
  });
});

describe("scrapePage mailto email extraction", () => {
  test("extracts an email from an icon-only mailto: link with no visible email text", async () => {
    const page = await scrapePage(`${server.url}mailto-icon-only`);
    expect(page).not.toBeNull();
    expect(page!.text).not.toContain("@"); // no visible email text — icon-only button
    expect(page?.pageEmail).toBe("hello@clean-co.example");
  });

  test("returns null when a page has no mailto: link or Cloudflare-obfuscated email", async () => {
    const page = await scrapePage(`${server.url}no-social`);
    expect(page?.pageEmail).toBeNull();
  });

  test("strips a malformed query string (space instead of '?') rather than leaking it into the email — found live against a real site", async () => {
    const page = await scrapePage(`${server.url}mailto-malformed`);
    expect(page?.pageEmail).toBe("contact@clean-co.example");
  });
});

describe("scrapePage Cloudflare email-obfuscation decoding", () => {
  test("decodes a Cloudflare-obfuscated email even inside a <footer>, which gets stripped before the LLM sees any text", async () => {
    const page = await scrapePage(`${server.url}cloudflare-email`);
    expect(page).not.toBeNull();
    expect(page!.text).not.toContain("@"); // only the "[email protected]" placeholder is visible text
    expect(page?.pageEmail).toBe("sales@example.com");
  });

  test("returns null for malformed data-cfemail hex rather than throwing", async () => {
    const page = await scrapePage(`${server.url}cloudflare-email-malformed`);
    expect(page?.pageEmail).toBeNull();
  });
});

describe("scrapePage logo (favicon) extraction", () => {
  test("prefers apple-touch-icon over a same-or-larger regular icon", async () => {
    const page = await scrapePage(`${server.url}logo-multiple-icons`);
    expect(page?.logoUrl).toBe(`${server.url}apple-touch-icon-180x180.png`);
  });

  test("resolves a relative icon href against the page's own URL", async () => {
    const page = await scrapePage(`${server.url}logo-relative-path`);
    expect(page?.logoUrl).toBe(`${server.url}images/favicon.ico`);
  });

  test("falls back to the /favicon.ico convention when no icon <link> is declared at all", async () => {
    const page = await scrapePage(`${server.url}logo-none-declared`);
    expect(page?.logoUrl).toBe(`${server.url}favicon.ico`);
  });
});
