import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { type Generated, type Kysely, sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BaseModel } from "../src/base-model.js";
import { createDb } from "../src/db.js";

interface WidgetTable {
  id: Generated<string>;
  name: string;
  qty: number;
  createdAt: Generated<Date>;
  deletedAt: Date | null;
}

interface TestDB {
  widgets: WidgetTable;
}

class WidgetModel extends BaseModel<TestDB, "widgets"> {
  constructor(db: Kysely<TestDB>) {
    super(db, "widgets");
  }
}

let container: StartedPostgreSqlContainer;
let db: Kysely<TestDB>;
let widgets: WidgetModel;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  db = createDb<TestDB>({ connectionString: container.getConnectionUri() });
  await sql`
    CREATE TABLE widgets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      qty integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz NULL
    )
  `.execute(db);
  widgets = new WidgetModel(db);
}, 120_000);

afterAll(async () => {
  await db?.destroy();
  await container?.stop();
});

beforeEach(async () => {
  await sql`TRUNCATE TABLE widgets`.execute(db);
});

describe("BaseModel", () => {
  it("insert returns the created row with generated fields", async () => {
    const row = await widgets.insert({ name: "alpha", qty: 3 });
    expect(row.id).toBeDefined();
    expect(row.name).toBe("alpha");
    expect(row.qty).toBe(3);
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.deletedAt).toBeNull();
  });

  it("findById returns the matching row or undefined", async () => {
    const inserted = await widgets.insert({ name: "beta", qty: 1 });
    const found = await widgets.findById(inserted.id);
    expect(found?.name).toBe("beta");

    const missing = await widgets.findById(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(missing).toBeUndefined();
  });

  it("findOne applies an equality filter", async () => {
    await widgets.insert({ name: "gamma", qty: 5 });
    await widgets.insert({ name: "gamma", qty: 9 });
    const found = await widgets.findOne({ qty: 9 });
    expect(found?.qty).toBe(9);
    expect(found?.name).toBe("gamma");
  });

  it("findOne matches NULL columns with IS NULL", async () => {
    const active = await widgets.insert({ name: "active", qty: 1 });
    await widgets.update({ id: active.id }, { deletedAt: new Date() });
    await widgets.insert({ name: "still-here", qty: 2 });

    const found = await widgets.findOne({ deletedAt: null });
    expect(found?.name).toBe("still-here");
  });

  it("find supports where, orderBy, limit and offset", async () => {
    await widgets.insert({ name: "a", qty: 1 });
    await widgets.insert({ name: "b", qty: 3 });
    await widgets.insert({ name: "c", qty: 2 });

    const ordered = await widgets.find(undefined, {
      orderBy: { column: "qty", direction: "desc" },
    });
    expect(ordered.map((w) => w.qty)).toEqual([3, 2, 1]);

    const limited = await widgets.find(undefined, {
      orderBy: { column: "qty", direction: "asc" },
      limit: 2,
    });
    expect(limited.map((w) => w.qty)).toEqual([1, 2]);

    const offsetted = await widgets.find(undefined, {
      orderBy: { column: "qty", direction: "asc" },
      limit: 2,
      offset: 1,
    });
    expect(offsetted.map((w) => w.qty)).toEqual([2, 3]);
  });

  it("update mutates matching rows and returns them", async () => {
    const row = await widgets.insert({ name: "old", qty: 0 });
    const updated = await widgets.update(
      { id: row.id },
      { name: "new", qty: 7 },
    );
    expect(updated).toHaveLength(1);
    expect(updated[0].name).toBe("new");
    expect(updated[0].qty).toBe(7);
  });

  it("delete removes matching rows and returns the count", async () => {
    await widgets.insert({ name: "del", qty: 1 });
    await widgets.insert({ name: "del", qty: 2 });
    await widgets.insert({ name: "keep", qty: 3 });

    const deleted = await widgets.delete({ name: "del" });
    expect(deleted).toBe(2);

    const remaining = await widgets.find();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe("keep");
  });

  it("paginate returns a page of rows plus the total count", async () => {
    for (let i = 0; i < 25; i++) {
      await widgets.insert({ name: `w${i}`, qty: i });
    }

    const firstPage = await widgets.paginate({
      page: 1,
      perPage: 10,
      orderBy: { column: "qty", direction: "asc" },
    });
    expect(firstPage.total).toBe(25);
    expect(firstPage.data).toHaveLength(10);
    expect(firstPage.data[0].qty).toBe(0);

    const thirdPage = await widgets.paginate({
      page: 3,
      perPage: 10,
      orderBy: { column: "qty", direction: "asc" },
    });
    expect(thirdPage.total).toBe(25);
    expect(thirdPage.data).toHaveLength(5);
    expect(thirdPage.data[0].qty).toBe(20);
  });

  it("paginate honours a where filter in both data and count", async () => {
    await widgets.insert({ name: "match", qty: 1 });
    await widgets.insert({ name: "match", qty: 2 });
    await widgets.insert({ name: "other", qty: 3 });

    const result = await widgets.paginate({
      where: { name: "match" },
      perPage: 10,
    });
    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
  });

  it("paginate clamps perPage above MAX_PER_PAGE to cap the page size", async () => {
    await sql`
      INSERT INTO widgets (name, qty)
      SELECT 'w' || g, g FROM generate_series(1, 101) AS g
    `.execute(db);

    const result = await widgets.paginate({ perPage: 200 });
    expect(result.total).toBe(101);
    expect(result.data).toHaveLength(100);
  });

  it("find applies a multi-column orderBy array", async () => {
    await widgets.insert({ name: "b", qty: 1 });
    await widgets.insert({ name: "a", qty: 1 });
    await widgets.insert({ name: "c", qty: 2 });

    const ordered = await widgets.find(undefined, {
      orderBy: [
        { column: "qty", direction: "asc" },
        { column: "name", direction: "desc" },
      ],
    });
    expect(ordered.map((w) => w.name)).toEqual(["b", "a", "c"]);
  });

  it("whereAll combines a value filter with an IS NULL filter", async () => {
    const deleted = await widgets.insert({ name: "target", qty: 1 });
    await widgets.update({ id: deleted.id }, { deletedAt: new Date() });
    const active = await widgets.insert({ name: "target", qty: 1 });
    await widgets.insert({ name: "target", qty: 2 });

    const rows = await widgets.find({ qty: 1, deletedAt: null });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(active.id);
  });

  it("update matching multiple rows returns all of them", async () => {
    await widgets.insert({ name: "dup", qty: 1 });
    await widgets.insert({ name: "dup", qty: 2 });
    await widgets.insert({ name: "unique", qty: 3 });

    const updated = await widgets.update({ name: "dup" }, { qty: 9 });
    expect(updated).toHaveLength(2);
    expect(updated.every((w) => w.qty === 9)).toBe(true);
  });

  it("delete with zero matches returns 0", async () => {
    await widgets.insert({ name: "keep", qty: 1 });
    const deleted = await widgets.delete({ name: "absent" });
    expect(deleted).toBe(0);
  });

  it("findOne and find return empty results when nothing matches", async () => {
    await widgets.insert({ name: "present", qty: 1 });

    expect(await widgets.findOne({ name: "missing" })).toBeUndefined();
    expect(await widgets.find({ name: "missing" })).toEqual([]);
  });
});
