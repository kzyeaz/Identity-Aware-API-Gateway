import { describe, expect, it } from "vitest";
import { Simulation } from "../apps/console/lib/simulation";

describe("presentation simulator policy", () => {
  it("rejects missing tokens and write requests without scope before rate limiting", () => {
    const simulation = new Simulation();
    expect(simulation.request("GET", "/api/projects", "anonymous").status).toBe(401);
    expect(simulation.request("GET", "/api/projects", "invalid").status).toBe(401);
    expect(simulation.request("POST", "/api/projects", "reader", { name: "x", description: "" }).status).toBe(403);
    expect(simulation.overview().denied).toBe(3);
  });
  it("exhausts a per-identity bucket and replenishes it with time", () => {
    let now = 1000;
    const simulation = new Simulation(() => now);
    for (let i = 0; i < 10; i++) expect(simulation.request("GET", "/api/projects", "writer").status).toBe(200);
    expect(simulation.request("GET", "/api/projects", "writer").status).toBe(429);
    expect(simulation.request("GET", "/api/projects", "reader").status).toBe(200);
    now += 200;
    expect(simulation.request("GET", "/api/projects", "writer").status).toBe(200);
    expect(simulation.overview().limited).toBe(1);
  });
  it("isolates projects and correlates mutations with request IDs", () => {
    const simulation = new Simulation();
    const created = simulation.request("POST", "/api/projects", "writer", { name: "  Demo  ", description: "" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "Demo", owner: "demo-writer" });
    expect(simulation.auditEvents()[0].requestId).toBe(created.headers["x-request-id"]);
    const project = created.body as { id: string };
    expect(simulation.request("GET", `/api/projects/${project.id}`, "reader").status).toBe(404);
    expect(simulation.request("GET", "/api/projects", "reader").body).toEqual([]);
    expect(simulation.request("GET", `/api/projects/${project.id}`, "writer").status).toBe(200);
  });
  it("validates writes and bounds the traffic history", () => {
    const simulation = new Simulation();
    expect(simulation.request("POST", "/api/projects", "writer", { name: " " }).status).toBe(400);
    expect(simulation.auditEvents()).toEqual([]);
    for (let i = 0; i < 120; i++) simulation.request("GET", "/api/projects", "anonymous");
    expect(simulation.overview().events).toHaveLength(100);
    expect(simulation.overview().total).toBe(121);
  });
});
