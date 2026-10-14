import { httpErrors } from "@fastify/sensible";
import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import type { Pool } from "pg";
import type { DB } from "../../db/schema.js";
import { TagModel, type TagWithUnread } from "../../models/tag-model.js";
import type {
  CreateTagBody,
  Tag,
  TagTreeNode,
  UpdateTagBody,
} from "../../types/tags.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Strip hyphens from a UUID so it's a valid ltree label. */
function uuidToLtreeSegment(uuid: string): string {
  return uuid.replace(/-/g, "");
}

/** Detect Postgres unique-violation and re-throw as 409 Conflict. */
function handleUniqueViolation(error: unknown): never {
  if (
    error instanceof Error &&
    (error as Error & { code?: string }).code === "23505"
  ) {
    throw httpErrors.conflict(
      "A tag with this name already exists under the same parent",
    );
  }
  throw error;
}

function buildTree(rows: TagWithUnread[]): TagTreeNode[] {
  const nodeMap = new Map<string, TagTreeNode>();
  const roots: TagTreeNode[] = [];

  // Create all nodes
  for (const row of rows) {
    nodeMap.set(row.id, {
      id: row.id,
      label: row.label,
      unreadMessages: row.unreadMessages,
      children: [],
    });
  }

  // Build hierarchy
  for (const row of rows) {
    const node = nodeMap.get(row.id);
    if (!node) continue;
    const parent = row.parentTagId ? nodeMap.get(row.parentTagId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Business logic for the `tags` domain. Composes {@link TagModel} for data
 * access and keeps the hierarchy orchestration (parent validation, circular
 * reference detection, ltree path recomputation, unique-violation mapping and
 * tree building) here, so route handlers stay thin controllers.
 */
export class TagService {
  private readonly model: TagModel;

  constructor(db: Kysely<DB>) {
    this.model = new TagModel(db);
  }

  async getById(userId: string, tagId: string): Promise<Tag> {
    const tag = await this.model.findByIdForUser(userId, tagId);
    if (!tag) {
      throw httpErrors.notFound("Tag not found");
    }
    return tag;
  }

  async create(userId: string, body: CreateTagBody): Promise<{ id: string }> {
    let parentPath: string | null = null;

    if (body.parentTagId) {
      parentPath =
        (await this.model.findParentPath(userId, body.parentTagId)) ?? null;

      if (parentPath === null) {
        throw httpErrors.badRequest(
          "Parent tag not found or not owned by user",
        );
      }
    }

    try {
      return await this.model.insertTag({
        userId,
        label: body.label,
        parentTagId: body.parentTagId ?? null,
        parentPath: parentPath ?? "",
      });
    } catch (error) {
      handleUniqueViolation(error);
    }
  }

  async update(
    userId: string,
    tagId: string,
    body: UpdateTagBody,
  ): Promise<{ id: string }> {
    // Fetch the existing tag (validates ownership / existence).
    const tag = await this.getById(userId, tagId);

    const newLabel = body.label ?? tag.label;

    // Determine if parent is changing
    const parentChanging = body.parentTagId !== undefined;
    const newParentTagId = parentChanging ? body.parentTagId : tag.parentTagId;

    if (parentChanging) {
      // Prevent setting self as parent
      if (newParentTagId === tagId) {
        throw httpErrors.badRequest("A tag cannot be its own parent");
      }

      // If moving to a non-null parent, validate it exists and is not a descendant
      let resolvedParentPath = "";
      if (newParentTagId !== null && newParentTagId !== undefined) {
        const parent = await this.getById(userId, newParentTagId);

        resolvedParentPath = parent.path;

        // Check if the new parent is a descendant of this tag (circular reference)
        const isDescendant = await this.model.isDescendant(
          newParentTagId,
          tag.path,
        );

        if (isDescendant) {
          throw httpErrors.badRequest(
            "Cannot move a tag under one of its own descendants",
          );
        }
      }

      // Recompute paths: this tag and all descendants
      const selfSegment = uuidToLtreeSegment(tagId);
      const newPath = resolvedParentPath
        ? `${resolvedParentPath}.${selfSegment}`
        : selfSegment;

      try {
        await this.model.moveSubtree({
          newPath,
          oldPath: tag.path,
          tagId,
          newParentTagId: newParentTagId ?? null,
          newLabel,
          userId,
        });
      } catch (error) {
        handleUniqueViolation(error);
      }
    } else {
      // Only label is changing
      try {
        await this.model.renameLabel(userId, tagId, newLabel);
      } catch (error) {
        handleUniqueViolation(error);
      }
    }

    return { id: tagId };
  }

  async list(userId: string): Promise<Tag[]> {
    return this.model.listForUser(userId);
  }

  async getTree(userId: string): Promise<TagTreeNode[]> {
    const rows = await this.model.treeRowsForUser(userId);
    return buildTree(rows);
  }

  async delete(userId: string, tagId: string): Promise<{ id: string }> {
    // Fetch the tag to get its path (also validates ownership / existence).
    const tag = await this.getById(userId, tagId);

    await this.model.deleteSubtreeAndReassignMessages(userId, tag.path);

    return { id: tagId };
  }
}

/**
 * Build a {@link TagService} from a raw pg {@link Pool}. Used by the
 * backward-compatible function wrappers below (and by tests) that still pass a
 * pool; route handlers instead construct the service from `app.db` directly.
 */
const serviceFromPool = (pool: Pool): TagService =>
  new TagService(createDbFromPool<DB>(pool));

export async function getTagById(
  pool: Pool,
  userId: string,
  tagId: string,
): Promise<Tag> {
  return serviceFromPool(pool).getById(userId, tagId);
}

export async function createTag(
  pool: Pool,
  userId: string,
  body: CreateTagBody,
): Promise<{ id: string }> {
  return serviceFromPool(pool).create(userId, body);
}

export async function updateTag(
  pool: Pool,
  userId: string,
  tagId: string,
  body: UpdateTagBody,
): Promise<{ id: string }> {
  return serviceFromPool(pool).update(userId, tagId, body);
}

export async function listTags(pool: Pool, userId: string): Promise<Tag[]> {
  return serviceFromPool(pool).list(userId);
}

export async function getTagTree(
  pool: Pool,
  userId: string,
): Promise<TagTreeNode[]> {
  return serviceFromPool(pool).getTree(userId);
}

export async function deleteTag(
  pool: Pool,
  userId: string,
  tagId: string,
): Promise<{ id: string }> {
  return serviceFromPool(pool).delete(userId, tagId);
}
