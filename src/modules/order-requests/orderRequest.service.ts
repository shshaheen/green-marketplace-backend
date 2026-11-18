import { createHash, randomBytes } from 'node:crypto';
import type { FilterQuery, Types } from 'mongoose';
import { ApiError, type ErrorDetail } from '../../utils/ApiError.js';
import { buildPaginationMeta, getSkip, type PaginationMeta } from '../../utils/pagination.js';
import { escapeRegex } from '../../utils/validators.js';
import { CURRENCY } from '../plant/plant.constants.js';
import { getRequestablePlants } from '../plant/plant.service.js';
import {
  ADMIN_TRANSITIONS,
  CUSTOMER_CANCELLABLE,
  NOTE_REQUIRED_TRANSITIONS,
  REFERENCE_DIGITS,
  REFERENCE_PREFIX,
  type OrderRequestStatus,
} from './orderRequest.constants.js';
import {
  OrderRequest,
  OrderRequestCounter,
  type OrderRequestAttrs,
  type OrderRequestRecord,
} from './orderRequest.model.js';
import type {
  AdminListOrderRequestsQuery,
  SubmitOrderRequestInput,
  TrackByReferenceInput,
} from './orderRequest.validation.js';

// ── Response shapes ────────────────────────────────────────────────────────

type Money = { amount: number; currency: string };
type Item = OrderRequestRecord['items'][number];

export interface OrderRequestItem {
  plantId: string;
  plantNameSnapshot: string;
  quantity: number;
  unit: Item['unit'];
  indicativePriceSnapshot: Money;
  imageUrlSnapshot: string | null;
  availabilitySnapshot: Item['availabilitySnapshot'];
}

/** What the customer sees when tracking. No contact details, admin notes or admin ids. */
export interface CustomerOrderRequest {
  referenceNumber: string;
  status: OrderRequestStatus;
  customerName: string;
  items: OrderRequestItem[];
  /** Indicative only; the final price is agreed with the nursery. */
  estimatedTotal: Money;
  intendedUse: OrderRequestRecord['intendedUse'];
  preferredDeliveryDate: string | null;
  additionalNotes: string | null;
  statusHistory: { status: OrderRequestStatus; at: Date }[];
  canCancel: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubmittedOrderRequest extends CustomerOrderRequest {
  /** Returned only once, at submission. The app must store it to track or cancel later. */
  trackingToken: string;
}

export interface AdminOrderRequestSummary {
  id: string;
  referenceNumber: string;
  status: OrderRequestStatus;
  customerDetails: OrderRequestRecord['customerDetails'];
  itemCount: number;
  totalQuantity: number;
  estimatedTotal: Money;
  intendedUse: OrderRequestRecord['intendedUse'];
  preferredDeliveryDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminOrderRequestDetail extends AdminOrderRequestSummary {
  items: OrderRequestItem[];
  additionalNotes: string | null;
  adminNotes: string | null;
  statusHistory: {
    from: OrderRequestStatus | null;
    to: OrderRequestStatus;
    by: 'customer' | 'admin';
    admin: { id: string; name: string } | null;
    note: string | null;
    at: Date;
  }[];
  /** Statuses the admin may move this request to next. */
  allowedTransitions: readonly OrderRequestStatus[];
}

// ── Mapping ────────────────────────────────────────────────────────────────

const toDateOnly = (date: Date | null | undefined) =>
  date ? date.toISOString().slice(0, 10) : null;

function toItems(record: Pick<OrderRequestRecord, 'items'>): OrderRequestItem[] {
  return record.items.map((item) => ({
    plantId: item.plantId.toString(),
    plantNameSnapshot: item.plantNameSnapshot,
    quantity: item.quantity,
    unit: item.unit,
    indicativePriceSnapshot: {
      amount: item.indicativePriceSnapshot.amount,
      currency: item.indicativePriceSnapshot.currency,
    },
    imageUrlSnapshot: item.imageUrlSnapshot ?? null,
    availabilitySnapshot: item.availabilitySnapshot,
  }));
}

function estimatedTotal(record: Pick<OrderRequestRecord, 'items'>): Money {
  const amount = record.items.reduce(
    (sum, item) => sum + item.indicativePriceSnapshot.amount * item.quantity,
    0,
  );
  return { amount, currency: CURRENCY };
}

function toCustomerView(record: OrderRequestRecord): CustomerOrderRequest {
  return {
    referenceNumber: record.referenceNumber,
    status: record.status,
    customerName: record.customerDetails.name,
    items: toItems(record),
    estimatedTotal: estimatedTotal(record),
    intendedUse: record.intendedUse,
    preferredDeliveryDate: toDateOnly(record.preferredDeliveryDate),
    additionalNotes: record.additionalNotes ?? null,
    statusHistory: record.statusHistory.map((change) => ({ status: change.to, at: change.at })),
    canCancel: CUSTOMER_CANCELLABLE.includes(record.status),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toAdminSummary(record: OrderRequestRecord): AdminOrderRequestSummary {
  const { name, phone, email, location, pincode } = record.customerDetails;
  return {
    id: record._id.toString(),
    referenceNumber: record.referenceNumber,
    status: record.status,
    customerDetails: { name, phone, email: email ?? null, location, pincode },
    itemCount: record.items.length,
    totalQuantity: record.items.reduce((sum, item) => sum + item.quantity, 0),
    estimatedTotal: estimatedTotal(record),
    intendedUse: record.intendedUse,
    preferredDeliveryDate: toDateOnly(record.preferredDeliveryDate),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

interface PopulatedHistoryEntry {
  from?: OrderRequestStatus | null;
  to: OrderRequestStatus;
  by: 'customer' | 'admin';
  adminId?: { _id: Types.ObjectId; name: string } | null;
  note?: string | null;
  at: Date;
}
type PopulatedRecord = Omit<OrderRequestRecord, 'statusHistory'> & {
  statusHistory: PopulatedHistoryEntry[];
};

function toAdminDetail(record: PopulatedRecord): AdminOrderRequestDetail {
  return {
    ...toAdminSummary(record as OrderRequestRecord),
    items: toItems(record),
    additionalNotes: record.additionalNotes ?? null,
    adminNotes: record.adminNotes ?? null,
    statusHistory: record.statusHistory.map((change) => ({
      from: change.from ?? null,
      to: change.to,
      by: change.by,
      admin: change.adminId
        ? { id: change.adminId._id.toString(), name: change.adminId.name }
        : null,
      note: change.note ?? null,
      at: change.at,
    })),
    allowedTransitions: ADMIN_TRANSITIONS[record.status],
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const requestNotFound = () => ApiError.notFound('Order request not found');

function currentYearInIndia(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(now),
  );
}

/** ORD-2026-00001, from an atomic per-year counter. */
async function nextReferenceNumber(): Promise<string> {
  const year = currentYearInIndia();
  const counter = await OrderRequestCounter.findOneAndUpdate(
    { _id: year },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  ).lean();
  return `${REFERENCE_PREFIX}-${year}-${String(counter.seq).padStart(REFERENCE_DIGITS, '0')}`;
}

async function fetchAdminDetail(id: string | Types.ObjectId): Promise<AdminOrderRequestDetail> {
  const record = await OrderRequest.findById(id).populate('statusHistory.adminId', 'name').lean();
  if (!record) throw requestNotFound();
  return toAdminDetail(record as unknown as PopulatedRecord);
}

// ── Customer operations ────────────────────────────────────────────────────

export async function submitOrderRequest(
  input: SubmitOrderRequestInput,
): Promise<SubmittedOrderRequest> {
  const plants = await getRequestablePlants(input.items.map((item) => item.plantId));

  const problems: ErrorDetail[] = [];
  input.items.forEach((item, index) => {
    const plant = plants.get(item.plantId);
    if (!plant) {
      problems.push({ field: `items.${index}.plantId`, message: 'This plant is not available' });
    } else if (item.quantity < plant.minOrderQty) {
      problems.push({
        field: `items.${index}.quantity`,
        message: `Minimum order quantity for ${plant.name} is ${plant.minOrderQty}`,
      });
    }
  });
  if (problems.length) {
    throw ApiError.badRequest('Some items cannot be requested', problems);
  }

  // Snapshots come from the database, never from the client.
  const items = input.items.map((item) => {
    const plant = plants.get(item.plantId)!;
    return {
      plantId: plant._id,
      plantNameSnapshot: plant.name,
      quantity: item.quantity,
      unit: plant.priceUnit,
      indicativePriceSnapshot: { amount: plant.price.amount, currency: plant.price.currency },
      imageUrlSnapshot: plant.images[0]?.url ?? null,
      availabilitySnapshot: plant.availability,
    };
  });

  const trackingToken = randomBytes(32).toString('base64url');
  const created = await OrderRequest.create({
    referenceNumber: await nextReferenceNumber(),
    trackingTokenHash: hashToken(trackingToken),
    customerDetails: input.customerDetails,
    items,
    intendedUse: input.intendedUse,
    preferredDeliveryDate: input.preferredDeliveryDate,
    additionalNotes: input.additionalNotes,
    status: 'submitted',
    statusHistory: [{ from: null, to: 'submitted', by: 'customer', at: new Date() }],
  });

  return { ...toCustomerView(created.toObject()), trackingToken };
}

export async function trackByToken(token: string): Promise<CustomerOrderRequest> {
  const record = await OrderRequest.findOne({ trackingTokenHash: hashToken(token) }).lean();
  if (!record) throw requestNotFound();
  return toCustomerView(record);
}

export async function trackByReference(
  input: TrackByReferenceInput,
): Promise<CustomerOrderRequest> {
  const record = await OrderRequest.findOne({
    referenceNumber: input.referenceNumber,
    'customerDetails.phone': input.phone,
  }).lean();
  if (!record) throw ApiError.notFound('No order request matches this reference number and phone');
  return toCustomerView(record);
}

export async function cancelByCustomer(
  referenceNumber: string,
  token: string,
  reason: string | null,
): Promise<CustomerOrderRequest> {
  const match = { referenceNumber, trackingTokenHash: hashToken(token) };
  const existing = await OrderRequest.findOne(match).select('status').lean();
  if (!existing) throw requestNotFound();
  if (!CUSTOMER_CANCELLABLE.includes(existing.status)) {
    throw ApiError.conflict('This request can no longer be cancelled. Please contact the nursery.');
  }

  const updated = await OrderRequest.findOneAndUpdate(
    { ...match, status: existing.status },
    {
      $set: { status: 'cancelled' },
      $push: {
        statusHistory: {
          from: existing.status,
          to: 'cancelled',
          by: 'customer',
          note: reason,
          at: new Date(),
        },
      },
    },
    { new: true },
  ).lean();
  if (!updated) throw ApiError.conflict('The request was updated meanwhile. Please try again.');
  return toCustomerView(updated);
}

// ── Admin operations ───────────────────────────────────────────────────────

export async function listOrderRequests(
  query: AdminListOrderRequestsQuery,
): Promise<{ items: AdminOrderRequestSummary[]; meta: PaginationMeta }> {
  const filter: FilterQuery<OrderRequestAttrs> = {};
  if (query.status) filter.status = query.status;
  if (query.search) {
    const pattern = { $regex: escapeRegex(query.search), $options: 'i' };
    filter.$or = [
      { referenceNumber: pattern },
      { 'customerDetails.name': pattern },
      { 'customerDetails.phone': pattern },
    ];
  }

  const [records, total] = await Promise.all([
    OrderRequest.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(getSkip(query))
      .limit(query.limit)
      .lean(),
    OrderRequest.countDocuments(filter),
  ]);

  return { items: records.map(toAdminSummary), meta: buildPaginationMeta(query, total) };
}

export function getOrderRequest(id: string): Promise<AdminOrderRequestDetail> {
  return fetchAdminDetail(id);
}

export async function updateStatus(
  id: string,
  to: OrderRequestStatus,
  note: string | null,
  adminId: string,
): Promise<AdminOrderRequestDetail> {
  const existing = await OrderRequest.findById(id).select('status').lean();
  if (!existing) throw requestNotFound();
  const from = existing.status;

  if (!ADMIN_TRANSITIONS[from].includes(to)) {
    const allowed = ADMIN_TRANSITIONS[from];
    throw ApiError.badRequest(
      allowed.length
        ? `Cannot change status from ${from} to ${to}. Allowed: ${allowed.join(', ')}`
        : `A ${from} request cannot change status`,
      [{ field: 'status', message: 'Status change not allowed' }],
    );
  }
  if (!note && NOTE_REQUIRED_TRANSITIONS.some(([f, t]) => f === from && t === to)) {
    throw ApiError.badRequest('A note is required for this status change', [
      { field: 'note', message: 'Explain why this request is being cancelled' },
    ]);
  }

  // Conditional on the status we checked, so two admins can't both move it.
  const updated = await OrderRequest.findOneAndUpdate(
    { _id: id, status: from },
    {
      $set: { status: to },
      $push: { statusHistory: { from, to, by: 'admin', adminId, note, at: new Date() } },
    },
  );
  if (!updated) throw ApiError.conflict('The request was updated meanwhile. Please reload.');

  return fetchAdminDetail(id);
}

export async function updateAdminNotes(
  id: string,
  adminNotes: string | null,
): Promise<AdminOrderRequestDetail> {
  const updated = await OrderRequest.findByIdAndUpdate(id, { $set: { adminNotes } });
  if (!updated) throw requestNotFound();
  return fetchAdminDetail(id);
}
