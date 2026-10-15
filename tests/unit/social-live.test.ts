import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createHub } from "@/server/hub";

const state = vi.hoisted(() => ({ client: null as EventEmitter | null }));
vi.mock("pg", () => ({ Client: class extends EventEmitter {
  constructor() { super(); state.client = this; }
  async connect() {}
  async query() { return {}; }
  async end() {}
} }));

describe("Social live signal", () => {
  it("fans out an id-only Social frame and rejects malformed/oversized signals", async () => {
    const load = vi.fn();
    const hub = createHub("postgres://test.invalid/test", load);
    const receive = vi.fn();
    const unsub = hub.subscribe(receive);
    try {
      await vi.waitFor(() => expect(receive).toHaveBeenCalledWith({ k: "resync", json: "{}" }));
      receive.mockClear();
      state.client!.emit("notification", { payload: JSON.stringify({ k: "socials", id: "sync", ciphertext: "must not leave server" }) });
      expect(receive).toHaveBeenCalledExactlyOnceWith({ k: "socials", json: '{"id":"sync"}' });
      expect(load).not.toHaveBeenCalled();
      state.client!.emit("notification", { payload: JSON.stringify({ k: "socials", id: "x".repeat(65) }) });
      state.client!.emit("notification", { payload: JSON.stringify({ k: "socials", id: 2 }) });
      expect(receive).toHaveBeenCalledTimes(1);
    } finally { unsub(); await hub.stop(); }
  });
});
