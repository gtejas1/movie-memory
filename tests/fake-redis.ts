/** Tiny in-memory stand-in for the Redis commands the fact cache uses. Honors TTLs via Date.now(). */
export class FakeRedis {
  private store = new Map<string, { value: string; expiresAt: number | null }>();
  /** Flip to true to simulate Redis being down. */
  down = false;

  reset() {
    this.store.clear();
    this.down = false;
  }

  private live(key: string) {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  private assertUp() {
    if (this.down) throw new Error("Redis is down");
  }

  async get(key: string) {
    this.assertUp();
    return this.live(key)?.value ?? null;
  }

  /** Supports: set(k, v, "EX", seconds) and set(k, v, "PX", ms, "NX"). */
  async set(key: string, value: string, ...options: (string | number)[]) {
    this.assertUp();
    const nx = options.includes("NX");
    const ex = options.indexOf("EX");
    const px = options.indexOf("PX");

    if (nx && this.live(key)) return null;

    let ttlMs: number | null = null;
    if (ex !== -1) ttlMs = Number(options[ex + 1]) * 1000;
    if (px !== -1) ttlMs = Number(options[px + 1]);

    this.store.set(key, { value, expiresAt: ttlMs === null ? null : Date.now() + ttlMs });
    return "OK";
  }

  async exists(key: string) {
    this.assertUp();
    return this.live(key) ? 1 : 0;
  }

  /** Only the compare-and-delete release script is used. */
  async eval(_script: string, _numKeys: number, key: string, token: string) {
    this.assertUp();
    if (this.live(key)?.value === token) {
      this.store.delete(key);
      return 1;
    }
    return 0;
  }
}

export const fakeRedis = new FakeRedis();
