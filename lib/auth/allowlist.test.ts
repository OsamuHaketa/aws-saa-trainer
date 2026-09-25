import { describe, expect, it } from "vitest";
import { isAllowed } from "./allowlist";

describe("isAllowed", () => {
  const env = { ALLOWED_EMAILS: " Me@Gmail.com , other@example.com", ALLOWED_DOMAINS: "xincere.jp" };

  it("ALLOWED_EMAILS のアドレスは許可する（大文字小文字と空白は無視）", () => {
    expect(isAllowed("me@gmail.com", env)).toBe(true);
    expect(isAllowed(" ME@GMAIL.COM ", env)).toBe(true);
  });

  it("ALLOWED_DOMAINS のドメインは許可する", () => {
    expect(isAllowed("someone@xincere.jp", env)).toBe(true);
    expect(isAllowed("someone@XINCERE.JP", env)).toBe(true);
  });

  it("サブドメインや、ドメインを含むだけのアドレスは許可しない", () => {
    expect(isAllowed("someone@sub.xincere.jp", env)).toBe(false);
    expect(isAllowed("someone@xincere.jp.evil.com", env)).toBe(false);
    expect(isAllowed("xincere.jp@evil.com", env)).toBe(false);
  });

  it("どちらにもなければ、また空なら許可しない", () => {
    expect(isAllowed("someone@gmail.com", env)).toBe(false);
    expect(isAllowed("", env)).toBe(false);
    expect(isAllowed(null, env)).toBe(false);
    expect(isAllowed("me@gmail.com", {})).toBe(false);
  });
});
