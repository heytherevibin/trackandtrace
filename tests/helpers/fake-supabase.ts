import { vi } from "vitest";
import type { Db } from "@/services/supabase/server";

// Minimal in-memory stand-in for the supabase-js query builder, covering the
// chains the repository uses: select/eq/order, upsert/select/single, delete/eq.

type Row = Record<string, unknown>;
type Filter = readonly [key: string, value: unknown];
type Result = { data: unknown; error: { code?: string; message: string } | null };

class Builder implements PromiseLike<Result> {
  private op: "select" | "upsert" | "delete" = "select";
  private readonly filters: Filter[] = [];
  private orderBy: { key: string; ascending: boolean } | null = null;
  private wantSingle = false;
  private payload: Row | null = null;
  private conflictKeys: string[] = [];

  constructor(private readonly store: Map<string, Row[]>, private readonly table: string, private readonly fail: () => Result["error"]) {}

  select(): this {
    return this;
  }
  eq(key: string, value: unknown): this {
    this.filters.push([key, value]);
    return this;
  }
  order(key: string, opts: { ascending: boolean }): this {
    this.orderBy = { key, ascending: opts.ascending };
    return this;
  }
  single(): this {
    this.wantSingle = true;
    return this;
  }
  upsert(payload: Row, opts: { onConflict: string }): this {
    this.op = "upsert";
    this.payload = payload;
    this.conflictKeys = opts.onConflict.split(",");
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }

  private rows(): Row[] {
    return this.store.get(this.table) ?? [];
  }
  private matches(row: Row): boolean {
    return this.filters.every(([k, v]) => row[k] === v);
  }

  private exec(): Result {
    const injected = this.fail();
    if (injected) return { data: null, error: injected };
    const all = this.rows();
    if (this.op === "delete") {
      this.store.set(this.table, all.filter((r) => !this.matches(r)));
      return { data: null, error: null };
    }
    if (this.op === "upsert" && this.payload) {
      const payload = this.payload;
      const idx = all.findIndex((r) => this.conflictKeys.every((k) => r[k] === payload[k]));
      const now = new Date().toISOString();
      const row: Row =
        idx >= 0
          ? { ...all[idx], ...payload, updated_at: now }
          : { id: `id-${all.length + 1}`, created_at: now, updated_at: now, checks: [], ...payload };
      const next = idx >= 0 ? all.map((r, i) => (i === idx ? row : r)) : [...all, row];
      this.store.set(this.table, next);
      return { data: this.wantSingle ? row : [row], error: null };
    }
    let out = all.filter((r) => this.matches(r));
    if (this.orderBy) {
      const { key, ascending } = this.orderBy;
      out = [...out].sort((a, b) => (String(a[key]) < String(b[key]) ? -1 : 1) * (ascending ? 1 : -1));
    }
    if (this.wantSingle) return out[0] ? { data: out[0], error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } };
    return { data: out, error: null };
  }

  then<R1 = Result, R2 = never>(onfulfilled?: ((v: Result) => R1 | PromiseLike<R1>) | null, onrejected?: ((e: unknown) => R2 | PromiseLike<R2>) | null): PromiseLike<R1 | R2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected);
  }
}

export class FakeSupabase {
  readonly tables = new Map<string, Row[]>();
  nextError: Result["error"] = null;
  readonly auth = {
    getClaims: vi.fn(async () => ({ data: null as { claims: Record<string, unknown> } | null, error: null as { message: string } | null })),
    signOut: vi.fn(async () => ({ error: null })),
    exchangeCodeForSession: vi.fn(async () => ({ error: null as { message: string } | null })),
    verifyOtp: vi.fn(async () => ({ error: null as { message: string } | null })),
    admin: { deleteUser: vi.fn(async () => ({ error: null as { message: string } | null })) },
  };

  from(table: string): Builder {
    return new Builder(this.tables, table, () => {
      const e = this.nextError;
      this.nextError = null;
      return e;
    });
  }

  seed(table: string, rows: Row[]): void {
    this.tables.set(table, rows);
  }

  asDb(): Db {
    return this as unknown as Db;
  }
}
