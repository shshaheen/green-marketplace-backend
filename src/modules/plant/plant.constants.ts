export const PRICE_UNITS = ['per_plant', 'per_pot', 'per_bag', 'per_dozen'] as const;
export const AVAILABILITY = ['in_stock', 'limited', 'out_of_stock'] as const;
export const SUNLIGHT = ['full_sun', 'partial_shade', 'full_shade', 'indirect_light'] as const;
export const HEIGHT_UNITS = ['cm', 'in', 'ft'] as const;

export const CURRENCY = 'INR';
export const MAX_IMAGES_PER_PLANT = 10;

/** Upper bound on a single price, in paise (₹1 crore). */
export const MAX_PRICE_PAISE = 1_000_000_000;

export type PriceUnit = (typeof PRICE_UNITS)[number];
export type Availability = (typeof AVAILABILITY)[number];
export type Sunlight = (typeof SUNLIGHT)[number];
export type HeightUnit = (typeof HEIGHT_UNITS)[number];
