import { describe, it, expect } from "vitest";describe("Backend",()=>{it("health check works",async()=>{const r=await fetch("http://localhost:3000/health");expect(r.ok).toBe(true)})})
