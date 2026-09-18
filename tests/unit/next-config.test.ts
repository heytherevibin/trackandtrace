import { getRedirectUrl, unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

// trakline.in is the one address; www answers with a permanent redirect to it.

function request(url: string) {
  return unstable_getResponseFromNextConfig({ url, nextConfig });
}

describe("next.config redirects", () => {
  it("sends www.trakline.in to trakline.in with a permanent redirect, keeping the path and query", async () => {
    const response = await request("https://www.trakline.in/pnr?utm_source=sms");
    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe("https://trakline.in/pnr?utm_source=sms");
  });

  it("sends the www home page to the apex home page", async () => {
    const response = await request("https://www.trakline.in/");
    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe("https://trakline.in/");
  });

  it("keeps a sign-in link's token on the way to the apex", async () => {
    const response = await request("https://www.trakline.in/auth/callback?next=%2Faccount&token_hash=abc&type=email");
    expect(getRedirectUrl(response)).toBe("https://trakline.in/auth/callback?next=%2Faccount&token_hash=abc&type=email");
  });

  it("leaves the apex, previews and local servers alone", async () => {
    for (const url of ["https://trakline.in/pnr", "https://trakline-bdq1lxt5p-trakline.vercel.app/", "http://localhost:3000/"]) {
      expect(getRedirectUrl(await request(url))).toBeNull();
    }
  });
});
