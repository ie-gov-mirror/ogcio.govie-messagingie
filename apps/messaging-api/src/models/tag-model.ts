import { BaseModel, type Kysely, sql } from "@ogcio/db-core";
import type { DB } from "../db/schema.js";
import type { Tag } from "../types/tags.js";

/**
 * Common SELECT list for tag reads, aliased to the API (camelCase) shape and
 * exposing `path` as text. Mirrors the previous `TAG_COLUMNS` constant so the
 * returned rows are byte-for-byte identical to the raw-pg implementation.
 */
const tagColumns = sql`t.id, t.user_id as "userId", t.label, t.parent_tag_id as "parentTagId", t.path::text as path, t.created_at as "createdAt", t.updated_at as "updatedAt"`;

export type TagWithUnread = Tag & { unreadMessages: number };

/**
 * Data-access model for the `tags` domain. Extends the shared {@link BaseModel}
 * for generic CRUD and ports the bespoke `ltree`-based hierarchy queries that
 * previously lived in `tag-service.ts`.
 *
 * The `ltree` operators (`<@`, `subpath`, `nlevel`, `::ltree` casts) cannot be
 * expressed through the Kysely query builder, so these finders drop to the
 * exported `sql` template. The SQL is kept identical to the previous raw-pg
 * implementation to preserve behaviour.
 */
export class TagModel extends BaseModel<DB, "tags"> {
  constructor(db: Kysely<DB>) {
    super(db, "tags");
  }

  /** Fetch a single tag owned by `userId`, or `undefined` when absent. */
  async findByIdForUser(
    userId: string,
    tagId: string,
  ): Promise<Tag | undefined> {
    const { rows } = await sql<Tag>`
      SELECT ${tagColumns}
      FROM tags t
      WHERE t.id = ${tagId} AND t.user_id = ${userId}
    `.execute(this.db);
    return rows.at(0);
  }

  /** Resolve the `ltree` path (as text) of a parent tag owned by `userId`. */
  async findParentPath(
    userId: string,
    parentTagId: string,
  ): Promise<string | undefined> {
    const { rows } = await sql<{ path: string }>`
      SELECT path::text FROM tags WHERE id = ${parentTagId} AND user_id = ${userId}
    `.execute(this.db);
    return rows.at(0)?.path;
  }

  /** Insert a tag, computing its `ltree` path from the parent path. */
  async insertTag(params: {
    userId: string;
    label: string;
    parentTagId: string | null;
    parentPath: string;
  }): Promise<{ id: string }> {
    const { rows } = await sql<{ id: string; path: string }>`
      INSERT INTO tags (user_id, label, parent_tag_id, path)
      VALUES (${params.userId}, ${params.label}, ${params.parentTagId}, (${params.parentPath} || CASE WHEN ${params.parentPath} = '' THEN '' ELSE '.' END || replace(gen_random_uuid()::text, '-', ''))::ltree)
      RETURNING id, path::text
    `.execute(this.db);
    return { id: rows[0].id };
  }

  /** Whether `newParentTagId` is a descendant of the subtree rooted at `tagPath`. */
  async isDescendant(
    newParentTagId: string,
    tagPath: string,
  ): Promise<boolean> {
    const { rows } = await sql<{ exists: boolean }>`
      SELECT EXISTS(
        SELECT 1 FROM tags
        WHERE id = ${newParentTagId} AND path <@ ${tagPath}::ltree
      ) AS exists
    `.execute(this.db);
    return Boolean(rows.at(0)?.exists);
  }

  /**
   * Re-parent a tag and rewrite the `ltree` path of it and all its descendants,
   * also updating the moved node's `parent_tag_id`/`label`.
   */
  async moveSubtree(params: {
    newPath: string;
    oldPath: string;
    tagId: string;
    newParentTagId: string | null;
    newLabel: string;
    userId: string;
  }): Promise<void> {
    await sql`
      UPDATE tags
      SET path = CASE
            WHEN path = ${params.oldPath}::ltree THEN ${params.newPath}::ltree
            ELSE ${params.newPath}::ltree || subpath(path, nlevel(${params.oldPath}::ltree))
          END,
          parent_tag_id = CASE WHEN id = ${params.tagId} THEN ${params.newParentTagId} ELSE parent_tag_id END,
          label = CASE WHEN id = ${params.tagId} THEN ${params.newLabel} ELSE label END,
          updated_at = now()
      WHERE path <@ ${params.oldPath}::ltree AND user_id = ${params.userId}
    `.execute(this.db);
  }

  /** Rename a tag's label without touching its position in the hierarchy. */
  async renameLabel(
    userId: string,
    tagId: string,
    label: string,
  ): Promise<void> {
    await sql`
      UPDATE tags SET label = ${label}, updated_at = now() WHERE id = ${tagId} AND user_id = ${userId}
    `.execute(this.db);
  }

  /** All tags for a user, ordered by label. */
  async listForUser(userId: string): Promise<Tag[]> {
    const { rows } = await sql<Tag>`
      SELECT ${tagColumns}
      FROM tags t
      WHERE t.user_id = ${userId}
      ORDER BY t.label
    `.execute(this.db);
    return rows;
  }

  /** Tag rows enriched with the per-tag unread message count, ordered by label. */
  async treeRowsForUser(userId: string): Promise<TagWithUnread[]> {
    const { rows } = await sql<TagWithUnread>`
      SELECT ${tagColumns},
             COALESCE(COUNT(m.id) FILTER (WHERE m.is_seen = false), 0)::int AS "unreadMessages"
      FROM tags t
      LEFT JOIN messages m ON m.tag_id = t.id
      WHERE t.user_id = ${userId}
      GROUP BY t.id
      ORDER BY t.label
    `.execute(this.db);
    return rows;
  }

  /**
   * Delete a tag and all of its descendants, first reassigning any attached
   * messages back to the inbox (untagged). Runs in a single transaction so the
   * reassignment and deletion are atomic, matching the previous manual
   * `BEGIN`/`COMMIT` implementation.
   */
  async deleteSubtreeAndReassignMessages(
    userId: string,
    tagPath: string,
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await sql`
        UPDATE messages m
        SET tag_id = NULL
        FROM tags t
        WHERE m.tag_id = t.id
          AND t.path <@ ${tagPath}::ltree
          AND t.user_id = ${userId}
      `.execute(trx);

      await sql`
        DELETE FROM tags WHERE path <@ ${tagPath}::ltree AND user_id = ${userId}
      `.execute(trx);
    });
  }
}
