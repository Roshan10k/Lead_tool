import { describe, expect, test } from "bun:test";
import { isPlausibleEmail, isRoleBasedEmail } from "./email";

describe("isPlausibleEmail", () => {
  test("accepts a well-formed email", () => {
    expect(isPlausibleEmail("info@example.com")).toBe(true);
  });

  test("rejects null/undefined", () => {
    expect(isPlausibleEmail(null)).toBe(false);
    expect(isPlausibleEmail(undefined)).toBe(false);
  });

  test("rejects an empty string", () => {
    expect(isPlausibleEmail("")).toBe(false);
  });

  test("rejects Cloudflare's obfuscation placeholder text — found live as an actual LLM extraction result", () => {
    expect(isPlausibleEmail("[email protected]")).toBe(false);
  });

  test("rejects a value with no @ at all", () => {
    expect(isPlausibleEmail("not an email")).toBe(false);
  });

  test("rejects a domain with no dot", () => {
    expect(isPlausibleEmail("info@localhost")).toBe(false);
  });

  test("rejects a value containing whitespace", () => {
    expect(isPlausibleEmail("info@example.com subject=hi")).toBe(false);
  });
});

describe("isRoleBasedEmail", () => {
  test("recognizes common generic role inboxes", () => {
    expect(isRoleBasedEmail("info@clean-co.example")).toBe(true);
    expect(isRoleBasedEmail("contact@clean-co.example")).toBe(true);
    expect(isRoleBasedEmail("sales@clean-co.example")).toBe(true);
    expect(isRoleBasedEmail("enquiries@clean-co.example")).toBe(true);
  });

  test("is case-insensitive", () => {
    expect(isRoleBasedEmail("Info@Clean-Co.example")).toBe(true);
  });

  test("catches a role word combined with a separator, e.g. 'sales-team@' or 'info.uk@'", () => {
    expect(isRoleBasedEmail("sales-team@clean-co.example")).toBe(true);
    expect(isRoleBasedEmail("info.uk@clean-co.example")).toBe(true);
  });

  test("does not false-positive on a word that merely contains a role word as a substring", () => {
    expect(isRoleBasedEmail("informant@clean-co.example")).toBe(false);
  });

  test("treats what looks like a personal name as not role-based", () => {
    expect(isRoleBasedEmail("jane.smith@clean-co.example")).toBe(false);
    expect(isRoleBasedEmail("dave@clean-co.example")).toBe(false);
  });

  test("returns null (not false) for an implausible or missing email — can't tell, not confirmed personal", () => {
    expect(isRoleBasedEmail(null)).toBeNull();
    expect(isRoleBasedEmail(undefined)).toBeNull();
    expect(isRoleBasedEmail("not an email")).toBeNull();
  });
});
