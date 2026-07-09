/**
 * Unit tests for presence.ts — Live Presence System.
 *
 * Mock strategy:
 *   - Mock `@/lib/redis` → control `getRedis()` return value
 *   - Create a fake Redis client implementing the RedisAdapter interface
 *   - Test all functions: heartbeat, isUserOnline, getLastSeen, getOnlineUsers, removePresence
 *   - Test graceful fallback when Redis is null (not configured)
 *   - Test error handling (Redis operations throw)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Fake Redis client ──────────────────────────────────────
interface FakeRedisStore {
  [key: string]: string | null;
}

function createFakeRedis(initialStore: FakeRedisStore = {}) {
  const store: FakeRedisStore = { ...initialStore };

  return {
    store, // expose for assertions
    async get<T = string>(key: string): Promise<T | null> {
      return (store[key] ?? null) as T | null;
    },
    async set(
      key: string,
      value: string | number,
      _opts?: { ex?: number }
    ): Promise<"OK" | null> {
      store[key] = String(value);
      return "OK";
    },
    async del(key: string): Promise<number> {
      const existed = key in store;
      delete store[key];
      return existed ? 1 : 0;
    },
    async incr(key: string): Promise<number> {
      const current = parseInt(store[key] ?? "0", 10);
      store[key] = String(current + 1);
      return current + 1;
    },
    async expire(_key: string, _seconds: number): Promise<number> {
      return 1;
    },
    async ttl(_key: string): Promise<number> {
      return 60;
    },
    async mget(...keys: string[]): Promise<(string | null)[]> {
      return keys.map((k) => store[k] ?? null);
    },
    async ping(): Promise<string> {
      return "PONG";
    },
    pipeline() {
      const gets: string[] = [];
      return {
        get(key: string) {
          gets.push(key);
        },
        async exec(): Promise<(string | null)[]> {
          return gets.map((k) => store[k] ?? null);
        },
      };
    },
  };
}

// ─── Mock @/lib/redis ───────────────────────────────────────
vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(),
}));

import { getRedis } from "@/lib/redis";
import {
  heartbeat,
  isUserOnline,
  getLastSeen,
  getOnlineUsers,
  removePresence,
  PRESENCE_PREFIX,
} from "./presence";

const mockGetRedis = getRedis as ReturnType<typeof vi.fn>;

// ─── Tests ───────────────────────────────────────────────────
describe("presence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── heartbeat ───────────────────────────────────────────
  describe("heartbeat", () => {
    it("sets a key with the presence prefix and TTL", async () => {
      const redis = createFakeRedis();
      mockGetRedis.mockReturnValue(redis);

      await heartbeat("user-1");

      const key = `${PRESENCE_PREFIX}user-1`;
      expect(redis.store[key]).toBeDefined();
      // Should be a timestamp (number string)
      const ts = parseInt(redis.store[key] ?? "0", 10);
      expect(ts).toBeGreaterThan(Date.now() - 5000);
    });

    it("sets the presence key with correct TTL options", async () => {
      const redis = createFakeRedis();
      // Override set to capture the options argument
      let capturedOpts: { ex?: number } | undefined;
      redis.set = async (key: string, value: string | number, opts?: { ex?: number }) => {
        capturedOpts = opts;
        redis.store[key] = String(value);
        return "OK";
      };
      mockGetRedis.mockReturnValue(redis);

      await heartbeat("user-1");

      expect(capturedOpts).toEqual({ ex: 60 });
      expect(capturedOpts?.ex).toBe(60);
    });

    it("is no-op when Redis is not configured", async () => {
      mockGetRedis.mockReturnValue(null);

      // Should not throw
      await expect(heartbeat("user-1")).resolves.toBeUndefined();
    });

    it("silently fails when Redis throws", async () => {
      const redis = createFakeRedis();
      redis.set = vi.fn().mockRejectedValue(new Error("Connection lost"));
      mockGetRedis.mockReturnValue(redis);

      // Should not throw
      await expect(heartbeat("user-1")).resolves.toBeUndefined();
    });
  });

  // ─── isUserOnline ────────────────────────────────────────
  describe("isUserOnline", () => {
    it("returns true when user has a presence key", async () => {
      const redis = createFakeRedis({
        [`${PRESENCE_PREFIX}user-1`]: Date.now().toString(),
      });
      mockGetRedis.mockReturnValue(redis);

      const online = await isUserOnline("user-1");
      expect(online).toBe(true);
    });

    it("returns false when user has no presence key", async () => {
      const redis = createFakeRedis({});
      mockGetRedis.mockReturnValue(redis);

      const online = await isUserOnline("user-2");
      expect(online).toBe(false);
    });

    it("returns false when Redis is not configured", async () => {
      mockGetRedis.mockReturnValue(null);

      const online = await isUserOnline("user-1");
      expect(online).toBe(false);
    });

    it("returns false when Redis throws", async () => {
      const redis = createFakeRedis();
      redis.get = vi.fn().mockRejectedValue(new Error("Timeout"));
      mockGetRedis.mockReturnValue(redis);

      const online = await isUserOnline("user-1");
      expect(online).toBe(false);
    });
  });

  // ─── getLastSeen ─────────────────────────────────────────
  describe("getLastSeen", () => {
    it("returns the timestamp of the last heartbeat", async () => {
      const now = Date.now();
      const redis = createFakeRedis({
        [`${PRESENCE_PREFIX}user-1`]: now.toString(),
      });
      mockGetRedis.mockReturnValue(redis);

      const lastSeen = await getLastSeen("user-1");
      expect(lastSeen).toBe(now);
    });

    it("returns null when user is not online", async () => {
      const redis = createFakeRedis({});
      mockGetRedis.mockReturnValue(redis);

      const lastSeen = await getLastSeen("user-2");
      expect(lastSeen).toBeNull();
    });

    it("returns null when Redis is not configured", async () => {
      mockGetRedis.mockReturnValue(null);

      const lastSeen = await getLastSeen("user-1");
      expect(lastSeen).toBeNull();
    });

    it("returns null when Redis value is empty string", async () => {
      const redis = createFakeRedis({
        [`${PRESENCE_PREFIX}user-1`]: "",
      });
      mockGetRedis.mockReturnValue(redis);

      const lastSeen = await getLastSeen("user-1");
      expect(lastSeen).toBeNull();
    });

    it("returns null when Redis throws", async () => {
      const redis = createFakeRedis();
      redis.get = vi.fn().mockRejectedValue(new Error("Timeout"));
      mockGetRedis.mockReturnValue(redis);

      const lastSeen = await getLastSeen("user-1");
      expect(lastSeen).toBeNull();
    });
  });

  // ─── getOnlineUsers ──────────────────────────────────────
  describe("getOnlineUsers", () => {
    it("returns a Set of online user IDs", async () => {
      const now = Date.now();
      const redis = createFakeRedis({
        [`${PRESENCE_PREFIX}user-1`]: now.toString(),
        [`${PRESENCE_PREFIX}user-2`]: now.toString(),
        [`${PRESENCE_PREFIX}user-3`]: null!, // missing
      });
      mockGetRedis.mockReturnValue(redis);

      const online = await getOnlineUsers(["user-1", "user-2", "user-3"]);
      expect(online).toBeInstanceOf(Set);
      expect(online.has("user-1")).toBe(true);
      expect(online.has("user-2")).toBe(true);
      expect(online.has("user-3")).toBe(false);
      expect(online.size).toBe(2);
    });

    it("returns empty Set when no users are online", async () => {
      const redis = createFakeRedis({});
      mockGetRedis.mockReturnValue(redis);

      const online = await getOnlineUsers(["user-1", "user-2"]);
      expect(online.size).toBe(0);
    });

    it("returns empty Set when Redis is not configured", async () => {
      mockGetRedis.mockReturnValue(null);

      const online = await getOnlineUsers(["user-1", "user-2"]);
      expect(online.size).toBe(0);
    });

    it("returns empty Set on empty input", async () => {
      const redis = createFakeRedis({});
      mockGetRedis.mockReturnValue(redis);

      const online = await getOnlineUsers([]);
      expect(online.size).toBe(0);
    });

    it("handles mget returning partial results", async () => {
      const now = Date.now();
      const redis = createFakeRedis({
        [`${PRESENCE_PREFIX}user-1`]: now.toString(),
      });
      mockGetRedis.mockReturnValue(redis);

      const online = await getOnlineUsers(["user-1", "user-2"]);
      expect(online.has("user-1")).toBe(true);
      expect(online.has("user-2")).toBe(false);
    });

    it("returns empty Set when Redis throws", async () => {
      const redis = createFakeRedis();
      redis.mget = vi.fn().mockRejectedValue(new Error("Timeout"));
      mockGetRedis.mockReturnValue(redis);

      const online = await getOnlineUsers(["user-1"]);
      expect(online.size).toBe(0);
    });
  });

  // ─── removePresence ──────────────────────────────────────
  describe("removePresence", () => {
    it("deletes the presence key for the user", async () => {
      const redis = createFakeRedis({
        [`${PRESENCE_PREFIX}user-1`]: Date.now().toString(),
      });
      mockGetRedis.mockReturnValue(redis);

      await removePresence("user-1");

      expect(redis.store[`${PRESENCE_PREFIX}user-1`]).toBeUndefined();
    });

    it("is no-op when user has no presence key", async () => {
      const redis = createFakeRedis({});
      mockGetRedis.mockReturnValue(redis);

      // Should not throw
      await expect(removePresence("user-1")).resolves.toBeUndefined();
    });

    it("is no-op when Redis is not configured", async () => {
      mockGetRedis.mockReturnValue(null);

      await expect(removePresence("user-1")).resolves.toBeUndefined();
    });

    it("silently fails when Redis throws", async () => {
      const redis = createFakeRedis();
      redis.del = vi.fn().mockRejectedValue(new Error("Connection lost"));
      mockGetRedis.mockReturnValue(redis);

      await expect(removePresence("user-1")).resolves.toBeUndefined();
    });
  });

  // ─── Integration-style: full lifecycle ───────────────────
  describe("presence lifecycle", () => {
    it("user goes online → heartbeat → offline after remove", async () => {
      const redis = createFakeRedis();
      mockGetRedis.mockReturnValue(redis);

      // Initially offline
      expect(await isUserOnline("user-1")).toBe(false);

      // Goes online
      await heartbeat("user-1");
      expect(await isUserOnline("user-1")).toBe(true);

      // Has valid lastSeen timestamp
      const lastSeen = await getLastSeen("user-1");
      expect(lastSeen).toBeGreaterThan(0);

      // Goes offline
      await removePresence("user-1");
      expect(await isUserOnline("user-1")).toBe(false);
      expect(await getLastSeen("user-1")).toBeNull();
    });

    it("getOnlineUsers correctly tracks multiple users", async () => {
      const redis = createFakeRedis();
      mockGetRedis.mockReturnValue(redis);

      await heartbeat("alice");
      await heartbeat("bob");
      await heartbeat("charlie");

      const online = await getOnlineUsers([
        "alice",
        "bob",
        "charlie",
        "dave",
      ]);
      expect(online.size).toBe(3);
      expect(online.has("alice")).toBe(true);
      expect(online.has("bob")).toBe(true);
      expect(online.has("charlie")).toBe(true);
      expect(online.has("dave")).toBe(false);
    });
  });
});
