import type {
  Insertable,
  Kysely,
  Selectable,
  SelectQueryBuilder,
  Updateable,
} from "kysely";
import {
  type PaginatedResult,
  type PaginationInput,
  resolvePagination,
} from "./conventions.js";

/** A `column -> value` equality filter over a table's selectable columns. */
export type Where<DB, TB extends keyof DB> = Partial<Selectable<DB[TB]>>;

export interface OrderBy<DB, TB extends keyof DB> {
  column: keyof Selectable<DB[TB]> & string;
  direction?: "asc" | "desc";
}

export interface FindOptions<DB, TB extends keyof DB> {
  orderBy?: OrderBy<DB, TB> | OrderBy<DB, TB>[];
  limit?: number;
  offset?: number;
}

export interface PaginateOptions<DB, TB extends keyof DB>
  extends PaginationInput {
  where?: Where<DB, TB>;
  orderBy?: OrderBy<DB, TB> | OrderBy<DB, TB>[];
}

/**
 * A small hand-rolled "basic ORM" that delegates to Kysely while staying fully
 * typed via Kysely's `Selectable`/`Insertable`/`Updateable` helpers.
 *
 * Domain models extend this class for a concrete table and add bespoke finders
 * (e.g. paginated reads with `COUNT(*) OVER()`), composing the protected
 * {@link BaseModel.db} instance and the query helpers below.
 *
 * Internally, dynamic (runtime-keyed) query building erases Kysely's precise
 * column types, so a few casts are localized here; the public method signatures
 * remain fully typed against `DB[TB]`.
 */
export class BaseModel<DB, TB extends keyof DB & string> {
  constructor(
    protected readonly db: Kysely<DB>,
    protected readonly table: TB,
  ) {}

  /** Fetch a single row by its `id` primary key. */
  async findById(id: string): Promise<Selectable<DB[TB]> | undefined> {
    return this.findOne({ id } as Where<DB, TB>);
  }

  /** Fetch the first row matching the given equality filter. */
  async findOne(where: Where<DB, TB>): Promise<Selectable<DB[TB]> | undefined> {
    const query = this.whereAll(this.selectQuery(), where).limit(1);
    const row = await query.executeTakeFirst();
    return row as Selectable<DB[TB]> | undefined;
  }

  /** Fetch all rows matching an optional filter, with optional ordering/paging. */
  async find(
    where?: Where<DB, TB>,
    options: FindOptions<DB, TB> = {},
  ): Promise<Selectable<DB[TB]>[]> {
    let query = this.whereAll(this.selectQuery(), where);
    query = this.orderAll(query, options.orderBy);
    if (options.limit !== undefined) {
      query = query.limit(options.limit);
    }
    if (options.offset !== undefined) {
      query = query.offset(options.offset);
    }
    const rows = await query.execute();
    return rows as Selectable<DB[TB]>[];
  }

  /** Insert a single row, returning the inserted row. */
  async insert(values: Insertable<DB[TB]>): Promise<Selectable<DB[TB]>> {
    const row = await this.insertQuery()
      .values(values)
      .returningAll()
      .executeTakeFirstOrThrow();
    return row as Selectable<DB[TB]>;
  }

  /** Update rows matching the filter, returning the updated rows. */
  async update(
    where: Where<DB, TB>,
    patch: Updateable<DB[TB]>,
  ): Promise<Selectable<DB[TB]>[]> {
    const query = this.whereAll(this.updateQuery().set(patch), where);
    const rows = await query.returningAll().execute();
    return rows as Selectable<DB[TB]>[];
  }

  /** Delete rows matching the filter, returning the number of deleted rows. */
  async delete(where: Where<DB, TB>): Promise<number> {
    const query = this.whereAll(this.deleteQuery(), where);
    const result = await query.executeTakeFirst();
    return Number(result?.numDeletedRows ?? 0);
  }

  /**
   * Return a page of rows plus the total count of the unpaginated query.
   * Runs a data query (limit/offset/orderBy) and a `count(*)` query.
   */
  async paginate(
    options: PaginateOptions<DB, TB> = {},
  ): Promise<PaginatedResult<Selectable<DB[TB]>>> {
    const { limit, offset } = resolvePagination(options);

    const rows = await this.find(options.where, {
      orderBy: options.orderBy,
      limit,
      offset,
    });

    const countRow = await this.whereAll(
      // biome-ignore lint/suspicious/noExplicitAny: dynamic expression builder
      this.selectFromTable().select((eb: any) => eb.fn.countAll().as("total")),
      options.where,
    ).executeTakeFirst();

    return {
      data: rows,
      total: Number((countRow as { total?: number | string })?.total ?? 0),
    };
  }

  /**
   * Base `selectAll()` query for this table, fully typed. Exposed for custom
   * finders in subclasses that need to build on the standard projection.
   */
  protected selectAll(): SelectQueryBuilder<DB, TB, Selectable<DB[TB]>> {
    return this.db
      .selectFrom(this.table)
      .selectAll() as unknown as SelectQueryBuilder<DB, TB, Selectable<DB[TB]>>;
  }

  /**
   * The Kysely instance typed loosely for runtime-keyed query construction.
   * Subclasses with a concrete `DB` should prefer the strongly typed
   * {@link BaseModel.db} directly.
   */
  // biome-ignore lint/suspicious/noExplicitAny: runtime-keyed query building erases types
  protected get anyDb(): Kysely<any> {
    // biome-ignore lint/suspicious/noExplicitAny: see above
    return this.db as unknown as Kysely<any>;
  }

  // The following builders erase the generic table-name type so Kysely's
  // conditional types collapse to callable signatures; callers cast results
  // back to the precise `Selectable<DB[TB]>` shape.

  // biome-ignore lint/suspicious/noExplicitAny: runtime-keyed builder
  private selectFromTable(): any {
    // biome-ignore lint/suspicious/noExplicitAny: runtime-keyed builder
    return this.anyDb.selectFrom(this.table as any);
  }

  // biome-ignore lint/suspicious/noExplicitAny: runtime-keyed builder
  private selectQuery(): any {
    return this.selectFromTable().selectAll();
  }

  // biome-ignore lint/suspicious/noExplicitAny: runtime-keyed builder
  private insertQuery(): any {
    // biome-ignore lint/suspicious/noExplicitAny: runtime-keyed builder
    return this.anyDb.insertInto(this.table as any);
  }

  // biome-ignore lint/suspicious/noExplicitAny: runtime-keyed builder
  private updateQuery(): any {
    // biome-ignore lint/suspicious/noExplicitAny: runtime-keyed builder
    return this.anyDb.updateTable(this.table as any);
  }

  // biome-ignore lint/suspicious/noExplicitAny: runtime-keyed builder
  private deleteQuery(): any {
    // biome-ignore lint/suspicious/noExplicitAny: runtime-keyed builder
    return this.anyDb.deleteFrom(this.table as any);
  }

  /** Apply an equality filter to any query builder, using `IS NULL` for nulls. */
  protected whereAll<Q>(query: Q, where?: Where<DB, TB>): Q {
    if (!where) {
      return query;
    }
    // biome-ignore lint/suspicious/noExplicitAny: runtime-keyed builder
    let next = query as any;
    for (const [column, value] of Object.entries(where)) {
      next =
        value === null
          ? next.where(column, "is", null)
          : next.where(column, "=", value);
    }
    return next as Q;
  }

  private orderAll<Q>(
    query: Q,
    orderBy?: OrderBy<DB, TB> | OrderBy<DB, TB>[],
  ): Q {
    if (!orderBy) {
      return query;
    }
    const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
    // biome-ignore lint/suspicious/noExplicitAny: runtime-keyed builder
    let next = query as any;
    for (const clause of clauses) {
      next = next.orderBy(clause.column, clause.direction ?? "asc");
    }
    return next as Q;
  }
}
