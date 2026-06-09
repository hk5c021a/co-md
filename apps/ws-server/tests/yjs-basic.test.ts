import { describe, it, expect } from "vitest"; import { Doc } from "yjs"; describe("WS Yjs",()=>{it("creates a Y.Doc",()=>{const d=new Doc();expect(d.clientID).toBeGreaterThan(0)})})
