import {
  ORDER_REQUEST_STATUSES,
  type OrderRequestStatus,
} from '../order-requests/orderRequest.constants.js';
import { OrderRequest } from '../order-requests/orderRequest.model.js';
import {
  listOrderRequests,
  type AdminOrderRequestSummary,
} from '../order-requests/orderRequest.service.js';
import { Plant } from '../plant/plant.model.js';

const RECENT_LIMIT = 5;
const TOP_PLANTS_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
/** India has no daylight saving, so a fixed offset is exact. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface DashboardStats {
  orderRequests: {
    total: number;
    /** Requests waiting for a first look (status `submitted`). */
    newRequests: number;
    byStatus: Record<OrderRequestStatus, number>;
    /** Submitted since midnight India time, and in the last 7 and 30 days. */
    received: { today: number; last7Days: number; last30Days: number };
  };
  plants: { active: number; outOfStock: number };
  /** Plants in the most order requests (any status), ties broken by total quantity. */
  topRequestedPlants: {
    plantId: string;
    plantName: string;
    requestCount: number;
    totalQuantity: number;
  }[];
  recentRequests: AdminOrderRequestSummary[];
}

function startOfTodayInIndia(now = Date.now()): Date {
  return new Date(Math.floor((now + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS);
}

async function countByStatus(): Promise<Record<OrderRequestStatus, number>> {
  const rows = await OrderRequest.aggregate<{ _id: OrderRequestStatus; count: number }>([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(ORDER_REQUEST_STATUSES.map((status) => [status, 0])) as Record<
    OrderRequestStatus,
    number
  >;
  for (const row of rows) counts[row._id] = row.count;
  return counts;
}

async function topRequestedPlants(): Promise<DashboardStats['topRequestedPlants']> {
  const rows = await OrderRequest.aggregate<{
    _id: unknown;
    plantName: string;
    requestCount: number;
    totalQuantity: number;
  }>([
    { $sort: { createdAt: 1 } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.plantId',
        // Name from the most recent request, so renames show up over time.
        plantName: { $last: '$items.plantNameSnapshot' },
        requestCount: { $sum: 1 },
        totalQuantity: { $sum: '$items.quantity' },
      },
    },
    { $sort: { requestCount: -1, totalQuantity: -1, _id: 1 } },
    { $limit: TOP_PLANTS_LIMIT },
  ]);

  return rows.map((row) => ({
    plantId: String(row._id),
    plantName: row.plantName,
    requestCount: row.requestCount,
    totalQuantity: row.totalQuantity,
  }));
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = Date.now();
  const since = (date: Date) => OrderRequest.countDocuments({ createdAt: { $gte: date } });
  const activePlants = { isActive: true, deletedAt: null };

  const [byStatus, today, last7Days, last30Days, active, outOfStock, topPlants, recent] =
    await Promise.all([
      countByStatus(),
      since(startOfTodayInIndia(now)),
      since(new Date(now - 7 * DAY_MS)),
      since(new Date(now - 30 * DAY_MS)),
      Plant.countDocuments(activePlants),
      Plant.countDocuments({ ...activePlants, availability: 'out_of_stock' }),
      topRequestedPlants(),
      listOrderRequests({ page: 1, limit: RECENT_LIMIT }),
    ]);

  return {
    orderRequests: {
      total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
      newRequests: byStatus.submitted,
      byStatus,
      received: { today, last7Days, last30Days },
    },
    plants: { active, outOfStock },
    topRequestedPlants: topPlants,
    recentRequests: recent.items,
  };
}
