import type { FilterQuery, Types } from 'mongoose';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../utils/logger.js';
import { buildPaginationMeta, getSkip, type PaginationMeta } from '../../utils/pagination.js';
import { generateUniqueSlug } from '../../utils/slug.js';
import { escapeRegex } from '../../utils/validators.js';
import { assertValidPlantCategories, getVisibleCategoryIds } from '../category/category.service.js';
import { getImageStorage, type StoredImage } from '../upload/imageStorage.js';
import type { Availability, HeightUnit, PriceUnit, Sunlight } from './plant.constants.js';
import { MAX_IMAGES_PER_PLANT } from './plant.constants.js';
import { Plant, type PlantAttrs, type PlantRecord } from './plant.model.js';
import type {
  AdminListPlantsQuery,
  CreatePlantInput,
  PlantSort,
  PublicListPlantsQuery,
  UpdatePlantInput,
} from './plant.validation.js';

// ── Response shapes ────────────────────────────────────────────────────────

export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface PlantImage {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
}

export interface PublicPlantSummary {
  id: string;
  name: string;
  slug: string;
  price: { amount: number; currency: string };
  priceUnit: PriceUnit;
  minOrderQty: number;
  availability: Availability;
  /** Main image (the first one), or null. */
  image: PlantImage | null;
  category: CategoryRef | null;
  subcategory: CategoryRef | null;
}

export interface PlantAttributes {
  height: { min: number; max: number; unit: HeightUnit } | null;
  sunlight: Sunlight | null;
  watering: string | null;
}

export interface PublicPlantDetail extends PublicPlantSummary {
  description: string;
  images: PlantImage[];
  attributes: PlantAttributes;
}

export interface AdminPlant extends PublicPlantDetail {
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type PopulatedCategory = { _id: Types.ObjectId; name: string; slug: string } | null;
type PopulatedPlant = Omit<PlantRecord, 'category' | 'subcategory'> & {
  category: PopulatedCategory;
  subcategory: PopulatedCategory;
};

const toCategoryRef = (c: PopulatedCategory): CategoryRef | null =>
  c ? { id: c._id.toString(), name: c.name, slug: c.slug } : null;

function toImages(record: PopulatedPlant): PlantImage[] {
  return record.images.map((image) => ({
    id: image._id.toString(),
    url: image.url,
    width: image.width ?? null,
    height: image.height ?? null,
  }));
}

function toSummary(record: PopulatedPlant): PublicPlantSummary {
  return {
    id: record._id.toString(),
    name: record.name,
    slug: record.slug,
    price: { amount: record.price.amount, currency: record.price.currency },
    priceUnit: record.priceUnit,
    minOrderQty: record.minOrderQty,
    availability: record.availability,
    image: toImages(record)[0] ?? null,
    category: toCategoryRef(record.category),
    subcategory: toCategoryRef(record.subcategory),
  };
}

function toDetail(record: PopulatedPlant): PublicPlantDetail {
  const height = record.attributes?.height;
  return {
    ...toSummary(record),
    description: record.description,
    images: toImages(record),
    attributes: {
      height: height ? { min: height.min, max: height.max, unit: height.unit } : null,
      sunlight: record.attributes?.sunlight ?? null,
      watering: record.attributes?.watering ?? null,
    },
  };
}

function toAdminPlant(record: PopulatedPlant): AdminPlant {
  return {
    ...toDetail(record),
    isActive: record.isActive,
    deletedAt: record.deletedAt ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

const NOT_DELETED = { deletedAt: null } as const;

const SORTS: Record<PlantSort, Record<string, 1 | -1>> = {
  '-createdAt': { createdAt: -1, _id: -1 },
  createdAt: { createdAt: 1, _id: 1 },
  price: { 'price.amount': 1, _id: 1 },
  '-price': { 'price.amount': -1, _id: -1 },
  name: { name: 1, _id: 1 },
  '-name': { name: -1, _id: -1 },
};

const plantNotFound = () => ApiError.notFound('Plant not found');

function findPopulated(filter: FilterQuery<PlantAttrs>) {
  return Plant.find(filter)
    .populate<{ category: PopulatedCategory }>('category', 'name slug')
    .populate<{ subcategory: PopulatedCategory }>('subcategory', 'name slug');
}

async function fetchAdminPlant(id: string | Types.ObjectId): Promise<AdminPlant> {
  const [record] = await findPopulated({ _id: id, ...NOT_DELETED })
    .limit(1)
    .lean();
  if (!record) throw plantNotFound();
  return toAdminPlant(record);
}

async function loadPlant(id: string) {
  const plant = await Plant.findOne({ _id: id, ...NOT_DELETED });
  if (!plant) throw plantNotFound();
  return plant;
}

function uniqueSlug(name: string, excludeId?: Types.ObjectId): Promise<string> {
  return generateUniqueSlug(name, 'plant', async (slug) => {
    const filter: FilterQuery<PlantAttrs> = { slug };
    if (excludeId) filter._id = { $ne: excludeId };
    return Boolean(await Plant.exists(filter));
  });
}

/** Filters shared by the public and admin lists. */
function buildListFilter(query: PublicListPlantsQuery | AdminListPlantsQuery) {
  const filter: FilterQuery<PlantAttrs> = {};
  if (query.category) filter.category = query.category;
  if (query.subcategory) filter.subcategory = query.subcategory;
  if (query.availability) filter.availability = query.availability;
  if (query.search) filter.name = { $regex: escapeRegex(query.search), $options: 'i' };
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter['price.amount'] = {
      ...(query.minPrice !== undefined && { $gte: query.minPrice }),
      ...(query.maxPrice !== undefined && { $lte: query.maxPrice }),
    };
  }
  return filter;
}

async function paginate(
  filter: FilterQuery<PlantAttrs>,
  query: PublicListPlantsQuery | AdminListPlantsQuery,
) {
  const [records, total] = await Promise.all([
    findPopulated(filter)
      .sort(SORTS[query.sort])
      .collation({ locale: 'en' })
      .skip(getSkip(query))
      .limit(query.limit)
      .lean(),
    Plant.countDocuments(filter),
  ]);
  return { records, meta: buildPaginationMeta(query, total) };
}

/** Customers only see active plants whose category (and subcategory) are visible. */
async function publicVisibilityFilter(): Promise<FilterQuery<PlantAttrs>> {
  const visible = [...(await getVisibleCategoryIds())];
  return {
    isActive: true,
    ...NOT_DELETED,
    category: { $in: visible },
    $or: [{ subcategory: null }, { subcategory: { $in: visible } }],
  };
}

// ── Public operations ──────────────────────────────────────────────────────

export async function listPublicPlants(
  query: PublicListPlantsQuery,
): Promise<{ items: PublicPlantSummary[]; meta: PaginationMeta }> {
  const visibility = await publicVisibilityFilter();
  const filter = { $and: [visibility, buildListFilter(query)] };
  const { records, meta } = await paginate(filter, query);
  return { items: records.map(toSummary), meta };
}

export async function getPublicPlant(idOrSlug: string): Promise<PublicPlantDetail> {
  const match = /^[a-f\d]{24}$/i.test(idOrSlug)
    ? { $or: [{ _id: idOrSlug }, { slug: idOrSlug }] }
    : { slug: idOrSlug };

  const [record] = await findPopulated({ $and: [await publicVisibilityFilter(), match] })
    .limit(1)
    .lean();
  if (!record) throw plantNotFound();
  return toDetail(record);
}

/** Plants a customer can currently request, i.e. visible in the catalogue, keyed by id. */
export async function getRequestablePlants(ids: string[]): Promise<Map<string, PlantRecord>> {
  const records = await Plant.find({
    $and: [await publicVisibilityFilter(), { _id: { $in: ids } }],
  }).lean();
  return new Map(records.map((record) => [record._id.toString(), record]));
}

// ── Admin operations ───────────────────────────────────────────────────────

export async function listAdminPlants(
  query: AdminListPlantsQuery,
): Promise<{ items: AdminPlant[]; meta: PaginationMeta }> {
  const filter = buildListFilter(query);
  if (!query.includeDeleted) filter.deletedAt = null;
  if (query.isActive !== undefined) filter.isActive = query.isActive;

  const { records, meta } = await paginate(filter, query);
  return { items: records.map(toAdminPlant), meta };
}

export function getAdminPlant(id: string): Promise<AdminPlant> {
  return fetchAdminPlant(id);
}

export async function createPlant(input: CreatePlantInput, adminId: string): Promise<AdminPlant> {
  await assertValidPlantCategories(input.category, input.subcategory);

  const plant = await Plant.create({
    ...input,
    slug: await uniqueSlug(input.name),
    createdBy: adminId,
    updatedBy: adminId,
  });

  return fetchAdminPlant(plant._id);
}

export async function updatePlant(
  id: string,
  input: UpdatePlantInput,
  adminId: string,
): Promise<AdminPlant> {
  const plant = await loadPlant(id);

  if (input.category !== undefined || input.subcategory !== undefined) {
    const category = input.category ?? plant.category.toString();
    const subcategory =
      input.subcategory !== undefined ? input.subcategory : (plant.subcategory?.toString() ?? null);
    await assertValidPlantCategories(category, subcategory);
    plant.set({ category, subcategory });
  }

  if (input.name !== undefined && input.name !== plant.name) {
    plant.name = input.name;
    plant.slug = await uniqueSlug(input.name, plant._id);
  }

  const { name: _name, category: _c, subcategory: _s, ...rest } = input;
  plant.set({ ...rest, updatedBy: adminId });

  await plant.save();
  return fetchAdminPlant(plant._id);
}

export async function setPlantStatus(
  id: string,
  isActive: boolean,
  adminId: string,
): Promise<AdminPlant> {
  const plant = await loadPlant(id);
  plant.set({ isActive, updatedBy: adminId });
  await plant.save();
  return fetchAdminPlant(plant._id);
}

/**
 * Soft delete. Images stay in storage because existing order requests may still show them.
 */
export async function deletePlant(id: string, adminId: string): Promise<void> {
  const plant = await loadPlant(id);
  plant.set({ deletedAt: new Date(), isActive: false, updatedBy: adminId });
  await plant.save();
}

// ── Images ─────────────────────────────────────────────────────────────────

async function destroyQuietly(publicIds: string[]): Promise<void> {
  const storage = getImageStorage();
  await Promise.all(
    publicIds.map((publicId) =>
      storage.destroy(publicId).catch((err: unknown) => {
        logger.warn({ err, publicId }, 'Failed to delete image from storage');
      }),
    ),
  );
}

export async function addPlantImages(
  id: string,
  files: Buffer[],
  adminId: string,
): Promise<AdminPlant> {
  const plant = await loadPlant(id);
  if (plant.images.length + files.length > MAX_IMAGES_PER_PLANT) {
    throw ApiError.badRequest(
      `A plant can have at most ${MAX_IMAGES_PER_PLANT} images (it has ${plant.images.length})`,
    );
  }

  const storage = getImageStorage();
  const results = await Promise.allSettled(
    files.map((file) => storage.upload(file, { folder: `plants/${plant.id}` })),
  );
  const uploaded = results
    .filter((r): r is PromiseFulfilledResult<StoredImage> => r.status === 'fulfilled')
    .map((r) => r.value);

  const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failure) {
    await destroyQuietly(uploaded.map((image) => image.publicId));
    if (failure.reason instanceof ApiError) throw failure.reason;
    logger.error({ err: failure.reason }, 'Image upload failed');
    throw ApiError.serviceUnavailable('Image upload failed, please try again');
  }

  // Re-check the limit atomically in case another upload landed meanwhile.
  const result = await Plant.updateOne(
    {
      _id: plant._id,
      ...NOT_DELETED,
      $expr: { $lte: [{ $add: [{ $size: '$images' }, uploaded.length] }, MAX_IMAGES_PER_PLANT] },
    },
    { $push: { images: { $each: uploaded } }, $set: { updatedBy: adminId } },
  );
  if (result.modifiedCount === 0) {
    await destroyQuietly(uploaded.map((image) => image.publicId));
    throw ApiError.conflict('The plant changed while uploading. Please try again.');
  }

  return fetchAdminPlant(plant._id);
}

export async function removePlantImage(
  id: string,
  imageId: string,
  adminId: string,
): Promise<AdminPlant> {
  const plant = await loadPlant(id);
  const image = plant.images.id(imageId);
  if (!image) throw ApiError.notFound('Image not found');

  const { publicId } = image;
  image.deleteOne();
  plant.set('updatedBy', adminId);
  await plant.save();

  await destroyQuietly([publicId]);
  return fetchAdminPlant(plant._id);
}

export async function reorderPlantImages(
  id: string,
  imageIds: string[],
  adminId: string,
): Promise<AdminPlant> {
  const plant = await loadPlant(id);

  const current = plant.images.map((image) => image._id.toString());
  const isPermutation =
    imageIds.length === current.length &&
    new Set(imageIds).size === imageIds.length &&
    imageIds.every((imageId) => current.includes(imageId));
  if (!isPermutation) {
    throw ApiError.badRequest('imageIds must list every image of this plant exactly once');
  }

  const byId = new Map(plant.images.map((image) => [image._id.toString(), image.toObject()]));
  plant.set({ images: imageIds.map((imageId) => byId.get(imageId)), updatedBy: adminId });
  await plant.save();
  return fetchAdminPlant(plant._id);
}
