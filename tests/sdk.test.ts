import { describe, expect, it, vi } from "vitest";
import { GatewayError, IdentityClient } from "../packages/sdk/src/index";

describe("developer SDK", () => {
  it("retrieves a fresh token from the provider on each request", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("[]", { status: 200 }));
    const token = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    const client = new IdentityClient({ baseUrl: "https://api.test/", token, fetch: transport });
    await client.listProjects();
    transport.mockResolvedValueOnce(new Response("[]"));
    await client.listProjects();
    expect(transport).toHaveBeenNthCalledWith(2, "https://api.test/api/projects", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer second" })
    }));
  });
  it("preserves status, correlation, and retry metadata without retrying a write", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"error":"limited"}', {
      status: 429, headers: { "x-request-id": "trace-123", "retry-after": "2" }
    }));
    const client = new IdentityClient({ baseUrl: "https://api.test", token: () => "token", fetch: transport });
    await expect(client.createProject({ name: "Demo", description: "" })).rejects.toMatchObject({
      status: 429, requestId: "trace-123", retryAfter: "2", body: { error: "limited" },
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("preserves plain-text and empty upstream errors", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    const client = new IdentityClient({ baseUrl: "http://localhost:8088", token: () => "x", fetch: transport });
    await expect(client.listProjects()).rejects.toMatchObject({ body: "bad gateway", status: 502 });
    await expect(client.listProjects()).rejects.toBeInstanceOf(GatewayError);
  });
  it("encodes path parameters and carries caller cancellation", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
    const abort = new AbortController();
    abort.abort();
    const client = new IdentityClient({ baseUrl: "https://api.test", token: () => "x", fetch: transport });
    await client.getProject("a/b?c", abort.signal);
    expect(transport).toHaveBeenCalledWith("https://api.test/api/projects/a%2Fb%3Fc",
      expect.objectContaining({ signal: expect.objectContaining({ aborted: true }) }));
    expect(() => new IdentityClient({ baseUrl: "file:///tmp", token: () => "" })).toThrow("HTTP(S)");
  });
});
