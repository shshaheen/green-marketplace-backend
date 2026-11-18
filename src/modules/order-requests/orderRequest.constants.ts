export const ORDER_REQUEST_STATUSES = [
  'submitted',
  'under_review',
  'contacted',
  'accepted',
  'completed',
  'rejected',
  'cancelled',
] as const;

export type OrderRequestStatus = (typeof ORDER_REQUEST_STATUSES)[number];

/**
 * Status changes an admin may make, one step at a time:
 * Submitted → Under Review → Contacted → Accepted → Completed.
 * Rejected is possible until the request is accepted. After acceptance the
 * admin can cancel (with a note) if the deal falls through. Nothing goes backwards.
 */
export const ADMIN_TRANSITIONS: Record<OrderRequestStatus, readonly OrderRequestStatus[]> = {
  submitted: ['under_review', 'rejected'],
  under_review: ['contacted', 'rejected'],
  contacted: ['accepted', 'rejected'],
  accepted: ['completed', 'cancelled'],
  completed: [],
  rejected: [],
  cancelled: [],
};

/** Admin transitions that must include a note explaining why. */
export const NOTE_REQUIRED_TRANSITIONS: ReadonlyArray<[OrderRequestStatus, OrderRequestStatus]> = [
  ['accepted', 'cancelled'],
];

/** A customer can cancel only before the request is accepted. */
export const CUSTOMER_CANCELLABLE: readonly OrderRequestStatus[] = [
  'submitted',
  'under_review',
  'contacted',
];

export const STATUS_ACTORS = ['customer', 'admin'] as const;
export type StatusActor = (typeof STATUS_ACTORS)[number];

export const INTENDED_USES = [
  'resort',
  'farmhouse',
  'home',
  'landscaping',
  'garden',
  'commercial',
  'other',
] as const;
export type IntendedUse = (typeof INTENDED_USES)[number];

/** e.g. ORD-2026-00001: year (India time) plus a counter that restarts every year. */
export const REFERENCE_PREFIX = 'ORD';
export const REFERENCE_DIGITS = 5;
export const REFERENCE_NUMBER_PATTERN = /^ORD-\d{4}-\d{5,}$/;

export const MAX_ITEMS_PER_REQUEST = 50;
export const MAX_QTY_PER_ITEM = 100_000;
