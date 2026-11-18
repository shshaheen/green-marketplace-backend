import type { FilterQuery, Types } from 'mongoose';
import { ApiError } from '../../utils/ApiError.js';
import { buildPaginationMeta, getSkip, type PaginationMeta } from '../../utils/pagination.js';
import { generateUniqueSlug } from '../../utils/slug.js';
import { escapeRegex } from '../../utils/validators.js';
import { Plant } from '../plant/plant.model.js';
import { Category, type CategoryAttrs, type CategoryRecord } from './category.model.js';
import type {
  CreateCategoryInput,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from './category.validation.js';

// ── Response shapes ────────────────────────────────────────────────────────

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  parent: { id: string; name: string } | null;
  sortOrder: number;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
}

export interface PublicCategoryNode extends PublicCategory {
  subcategories: PublicCategory[];
}

type PopulatedParent = { _id: Types.ObjectId; name: string } | null;
type AdminCategoryRecord = Omit<CategoryRecord, 'parent'> & { parent: PopulatedParent };

function toAdminCategory(record: AdminCategoryRecord): AdminCategory {
  return {
    id: record._id.toString(),
    name: record.name,
    slug: record.slug,
    description: record.description,
    parent: record.parent ? { id: record.parent._id.toString(), name: record.parent.name } : null,
    sortOrder: record.sortOrder,
    isActive: record.isActive,
    deletedAt: record.deletedAt ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toPublicCategory(record: CategoryRecord): PublicCategory {
  return {
    id: record._id.toString(),
    name: record.name,
    slug: record.slug,
    description: record.description,
    sortOrder: record.sortOrder,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

const NOT_DELETED = { deletedAt: null } as const;
const DISPLAY_ORDER = { sortOrder: 1, name: 1 } as const;
const CASE_INSENSITIVE = { locale: 'en', strength: 2 } as const;

const categoryNotFound = () => ApiError.notFound('Category not found');

async function loadCategory(id: string) {
  const category = await Category.findOne({ _id: id, ...NOT_DELETED });
  if (!category) throw categoryNotFound();
  return category;
}

async function fetchAdminCategory(id: string | Types.ObjectId): Promise<AdminCategory> {
  const record = await Category.findOne({ _id: id, ...NOT_DELETED })
    .populate<{ parent: PopulatedParent }>('parent', 'name')
    .lean();
  if (!record) throw categoryNotFound();
  return toAdminCategory(record);
}

/** Checks that `parentId` is an existing top-level category and returns its id. */
async function resolveParent(
  parentId: string | null,
  selfId?: string,
): Promise<Types.ObjectId | null> {
  if (parentId === null) return null;
  if (parentId === selfId) {
    throw ApiError.badRequest('A category cannot be its own parent', [
      { field: 'parent', message: 'A category cannot be its own parent' },
    ]);
  }

  const parent = await Category.findOne({ _id: parentId, ...NOT_DELETED })
    .select('parent')
    .lean();
  if (!parent) {
    throw ApiError.badRequest('Parent category not found', [
      { field: 'parent', message: 'Parent category not found' },
    ]);
  }
  if (parent.parent) {
    throw ApiError.badRequest('Subcategories cannot have subcategories of their own', [
      { field: 'parent', message: 'Parent must be a top-level category' },
    ]);
  }
  return parent._id;
}

/** Names are unique among siblings, ignoring case. */
async function assertNameAvailable(
  name: string,
  parent: Types.ObjectId | null,
  excludeId?: Types.ObjectId,
): Promise<void> {
  const filter: FilterQuery<CategoryAttrs> = { name, parent, ...NOT_DELETED };
  if (excludeId) filter._id = { $ne: excludeId };

  const clash = await Category.exists(filter).collation(CASE_INSENSITIVE);
  if (clash) {
    throw ApiError.conflict(
      parent
        ? 'A subcategory with this name already exists in this category'
        : 'A category with this name already exists',
    );
  }
}

function uniqueSlug(name: string, excludeId?: Types.ObjectId): Promise<string> {
  return generateUniqueSlug(name, 'category', async (slug) => {
    const filter: FilterQuery<CategoryAttrs> = { slug };
    if (excludeId) filter._id = { $ne: excludeId };
    return Boolean(await Category.exists(filter));
  });
}

async function hasSubcategories(id: Types.ObjectId): Promise<boolean> {
  return Boolean(await Category.exists({ parent: id, ...NOT_DELETED }));
}

/** True if any non-deleted plant uses this category as its category or subcategory. */
async function hasPlants(id: Types.ObjectId): Promise<boolean> {
  return Boolean(
    await Plant.exists({ $or: [{ category: id }, { subcategory: id }], deletedAt: null }),
  );
}

// ── Admin operations ───────────────────────────────────────────────────────

export async function createCategory(
  input: CreateCategoryInput,
  adminId: string,
): Promise<AdminCategory> {
  const parent = await resolveParent(input.parent);
  await assertNameAvailable(input.name, parent);

  const category = await Category.create({
    name: input.name,
    slug: await uniqueSlug(input.name),
    description: input.description,
    parent,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
    createdBy: adminId,
    updatedBy: adminId,
  });

  return fetchAdminCategory(category._id);
}

export async function listCategories(
  query: ListCategoriesQuery,
): Promise<{ items: AdminCategory[]; meta: PaginationMeta }> {
  const filter: FilterQuery<CategoryAttrs> = query.includeDeleted ? {} : { ...NOT_DELETED };
  if (query.parent === 'root') filter.parent = null;
  else if (query.parent) filter.parent = query.parent;
  if (query.isActive !== undefined) filter.isActive = query.isActive;
  if (query.search) filter.name = { $regex: escapeRegex(query.search), $options: 'i' };

  const [records, total] = await Promise.all([
    Category.find(filter)
      .sort(DISPLAY_ORDER)
      .skip(getSkip(query))
      .limit(query.limit)
      .populate<{ parent: PopulatedParent }>('parent', 'name')
      .lean(),
    Category.countDocuments(filter),
  ]);

  return { items: records.map(toAdminCategory), meta: buildPaginationMeta(query, total) };
}

export function getCategory(id: string): Promise<AdminCategory> {
  return fetchAdminCategory(id);
}

export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
  adminId: string,
): Promise<AdminCategory> {
  const category = await loadCategory(id);

  let parent = category.parent ?? null;
  if (input.parent !== undefined) {
    parent = await resolveParent(input.parent, id);
    if (parent && (await hasSubcategories(category._id))) {
      throw ApiError.conflict(
        'This category has subcategories, so it cannot become a subcategory. Move or delete them first.',
      );
    }
  }

  const name = input.name ?? category.name;
  const nameChanged = input.name !== undefined && input.name !== category.name;
  const parentChanged = String(parent) !== String(category.parent ?? null);

  // Moving would leave plants pointing at a category/subcategory pair that no longer matches.
  if (parentChanged && (await hasPlants(category._id))) {
    throw ApiError.conflict(
      'Plants are assigned to this category, so it cannot be moved. Reassign them first.',
    );
  }
  if (nameChanged || parentChanged) await assertNameAvailable(name, parent, category._id);

  if (nameChanged) {
    category.name = name;
    category.slug = await uniqueSlug(name, category._id);
  }
  category.parent = parent;
  if (input.description !== undefined) category.description = input.description;
  if (input.sortOrder !== undefined) category.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) category.isActive = input.isActive;
  category.set('updatedBy', adminId);

  await category.save();
  return fetchAdminCategory(category._id);
}

/** Soft delete. Refused while the category still has subcategories. */
export async function deleteCategory(id: string, adminId: string): Promise<void> {
  const category = await loadCategory(id);

  if (await hasSubcategories(category._id)) {
    throw ApiError.conflict('Delete or move this category’s subcategories first');
  }
  if (await hasPlants(category._id)) {
    throw ApiError.conflict('Plants are assigned to this category. Reassign or delete them first.');
  }

  category.deletedAt = new Date();
  category.isActive = false;
  category.set('updatedBy', adminId);
  await category.save();
}

// ── Used by the plant module ───────────────────────────────────────────────

/**
 * Checks a plant's category assignment: `categoryId` must be an existing
 * top-level category, and `subcategoryId` (if any) one of its subcategories.
 * Inactive categories are allowed so admins can prepare a catalogue section.
 */
export async function assertValidPlantCategories(
  categoryId: string,
  subcategoryId: string | null,
): Promise<void> {
  const category = await Category.findOne({ _id: categoryId, ...NOT_DELETED })
    .select('parent')
    .lean();
  if (!category) {
    throw ApiError.badRequest('Category not found', [
      { field: 'category', message: 'Category not found' },
    ]);
  }
  if (category.parent) {
    throw ApiError.badRequest('Category must be a top-level category', [
      { field: 'category', message: 'Use a top-level category here and set the subcategory' },
    ]);
  }

  if (subcategoryId === null) return;
  const subcategory = await Category.findOne({ _id: subcategoryId, ...NOT_DELETED })
    .select('parent')
    .lean();
  if (!subcategory || String(subcategory.parent) !== categoryId) {
    throw ApiError.badRequest('Subcategory does not belong to the selected category', [
      { field: 'subcategory', message: 'Subcategory does not belong to the selected category' },
    ]);
  }
}

/**
 * Ids of categories customers can see: active, not deleted, and (for a
 * subcategory) under a visible parent.
 */
export async function getVisibleCategoryIds(): Promise<Set<string>> {
  const records = await Category.find({ isActive: true, ...NOT_DELETED })
    .select('parent')
    .lean();
  const visibleRoots = new Set(records.filter((r) => !r.parent).map((r) => r._id.toString()));
  const visible = new Set(visibleRoots);
  for (const record of records) {
    if (record.parent && visibleRoots.has(record.parent.toString())) {
      visible.add(record._id.toString());
    }
  }
  return visible;
}

// ── Public operations ──────────────────────────────────────────────────────

/**
 * Active categories with their active subcategories. A subcategory whose
 * parent is inactive is hidden along with it.
 */
export async function getPublicCategoryTree(): Promise<PublicCategoryNode[]> {
  const records = await Category.find({ isActive: true, ...NOT_DELETED })
    .sort(DISPLAY_ORDER)
    .lean();

  const childrenByParent = new Map<string, PublicCategory[]>();
  for (const record of records) {
    if (!record.parent) continue;
    const key = record.parent.toString();
    const siblings = childrenByParent.get(key) ?? [];
    siblings.push(toPublicCategory(record));
    childrenByParent.set(key, siblings);
  }

  return records
    .filter((record) => !record.parent)
    .map((record) => ({
      ...toPublicCategory(record),
      subcategories: childrenByParent.get(record._id.toString()) ?? [],
    }));
}
