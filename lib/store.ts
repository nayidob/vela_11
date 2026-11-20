import { Redis } from "@upstash/redis";

/**
 * Tiny key-value layer. Uses Upstash Redis when its env vars are present
 * (Vercel Marketplace sets KV_REST_API_* or UPSTASH_REDIS_REST_*), and an
 * in-memory map otherwise so `npm run dev` works with zero setup.
 *
 * Events are stored in a separate list per case so concurrent tool calls
 * (e.g. log_insight firing while check_medication runs) never overwrite
 * each other.
 */

type Json = unknown;

interface Backend {
  get<T = Json>(key: string): Promise<T | null>;
  mget<T = Json>(keys: string[]): Promise<(T | null)[]>;
  set(key: string, value: Json, ttlSecs?: number): Promise<void>;
  /** Sets only if the key is missing; true when this call created it. */
  setnx(key: string, value: Json): Promise<boolean>;
  incr(key: string): Promise<number>;
  del(key: string): Promise<void>;
  lpush(key: string, value: string): Promise<void>;
  lrange(key: string): Promise<string[]>;
  rpush(key: string, value: Json): Promise<void>;
  rrange<T = Json>(key: string): Promise<T[]>;
  lrem(key: string, value: string): Promise<void>;
}

const TTL = 60 * 60 * 24 * 14; // keep demo data two weeks

function redisBackend(): Backend | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const r = new Redis({ url, token });
  return {
    async get<T>(key: string) {
      return (await r.get<T>(key)) ?? null;
    },
    async mget<T>(keys: string[]) {
      if (!keys.length) return [];
      return ((await r.mget<(T | null)[]>(...keys)) ?? []).map((v) => v ?? null);
    },
    async set(key, value, ttl = TTL) {
      await r.set(key, value, { ex: ttl });
    },
    async setnx(key, value) {
      return (await r.set(key, value, { nx: true, ex: TTL })) === "OK";
    },
    async incr(key) {
      return r.incr(key);
    },
    async del(key) {
      await r.del(key);
    },
    async lpush(key, value) {
      await r.lpush(key, value);
      await r.expire(key, TTL);
    },
    async lrange(key) {
      return (await r.lrange<string>(key, 0, 199)) ?? [];
    },
    async rpush(key, value) {
      await r.rpush(key, value);
      await r.expire(key, TTL);
    },
    async rrange<T>(key: string) {
      return ((await r.lrange<T>(key, 0, -1)) ?? []) as T[];
    },
    async lrem(key, value) {
      await r.lrem(key, 0, value);
    },
  };
}

function memoryBackend(): Backend {
  const g = globalThis as unknown as { __velaMem?: Map<string, unknown> };
  if (!g.__velaMem) g.__velaMem = new Map();
  const m = g.__velaMem;
  const list = (k: string) => {
    if (!Array.isArray(m.get(k))) m.set(k, []);
    return m.get(k) as unknown[];
  };
  return {
    async get<T>(key: string) {
      const v = m.get(key);
      return v === undefined ? null : (structuredClone(v) as T);
    },
    async mget<T>(keys: string[]) {
      return keys.map((k) => {
        const v = m.get(k);
        return v === undefined ? null : (structuredClone(v) as T);
      });
    },
    async set(key, value) {
      m.set(key, structuredClone(value));
    },
    async setnx(key, value) {
      if (m.has(key)) return false;
      m.set(key, structuredClone(value));
      return true;
    },
    async incr(key) {
      const n = (Number(m.get(key)) || 0) + 1;
      m.set(key, n);
      return n;
    },
    async del(key) {
      m.delete(key);
    },
    async lpush(key, value) {
      list(key).unshift(value);
    },
    async lrange(key) {
      return list(key).slice(0, 200) as string[];
    },
    async rpush(key, value) {
      list(key).push(structuredClone(value));
    },
    async rrange<T>(key: string) {
      return structuredClone(list(key)) as T[];
    },
    async lrem(key, value) {
      m.set(
        key,
        list(key).filter((x) => x !== value),
      );
    },
  };
}

let backend: Backend | null = null;
export function db(): Backend {
  if (!backend) backend = redisBackend() ?? memoryBackend();
  return backend;
}

export function storageMode(): "redis" | "memory" {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL ? "redis" : "memory";
}
