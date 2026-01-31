import { BillingConfig, ItemType, BillingRow } from '../types';

/**
 * Simple BODMAS evaluator for math strings.
 * Supports basic operators: +, -, *, /
 */
export function evaluateExpression(input: string): number {
  try {
    // Basic sanitization: only numbers and operators
    const sanitized = input.replace(/[^0-9.+\-*/()]/g, '');
    if (!sanitized) return 0;
    
    // Function constructor is a simple way to eval simple math in a controlled-ish way
    const result = new Function(`return ${sanitized}`)();
    return typeof result === 'number' && isFinite(result) ? result : 0;
  } catch (e) {
    return 0;
  }
}

/**
 * Calculates the amount for a parcel based on tiered slabs.
 * New Tier Logic based on 177kg example:
 * S1: First 10kg
 * S2: Next 100kg (Total up to 110kg)
 * S3: Remainder (> 110kg)
 */
export function calculateParcelAmount(weight: number, config: BillingConfig): { 
  total: number, 
  breakdown: string,
  s1w: number,
  s2w: number,
  s3w: number
} {
  // Rule: any decimal, consider next rounding off number (e.g. 5.14 = 6)
  const roundedWeight = weight > 0 ? Math.ceil(weight) : 0;
  
  let remaining = roundedWeight;
  let total = 0;
  let s1w = 0, s2w = 0, s3w = 0;
  const components: string[] = [];

  // Slab 1: First 10kg
  s1w = Math.min(remaining, 10);
  if (s1w > 0) {
    total += s1w * config.parcelSlab1Rate;
    components.push(`${s1w}kg*${config.parcelSlab1Rate}`);
    remaining -= s1w;
  }

  if (remaining > 0) {
    // Slab 2: Next 100kg (User's new requirement based on 177kg example)
    s2w = Math.min(remaining, 100); 
    total += s2w * config.parcelSlab2Rate;
    components.push(`${s2w}kg*${config.parcelSlab2Rate}`);
    remaining -= s2w;
  }

  if (remaining > 0) {
    // Slab 3: Remainder above 110kg
    s3w = remaining;
    total += s3w * config.parcelSlab3Rate;
    components.push(`${s3w}kg*${config.parcelSlab3Rate}`);
  }

  return { 
    total, 
    breakdown: components.join(' + ') || '₹0.00',
    s1w,
    s2w,
    s3w
  };
}

export function calculateRow(row: Omit<BillingRow, 'rate' | 'amount' | 'breakdown'> & { rate?: number, isManualRate?: boolean }, config: BillingConfig): BillingRow {
  let amount = 0;
  let rate = row.rate || 0;
  let isManualRate = row.isManualRate || false;
  let breakdown = '';

  const roundedWeight = row.weight > 0 ? Math.ceil(row.weight) : 0;

  if (row.type === ItemType.DOCUMENT) {
    if (!isManualRate) {
      rate = config.documentRate;
    }
    amount = rate; 
    breakdown = `Flat: ₹${rate}`;
  } else {
    const calc = calculateParcelAmount(row.weight, config);
    if (!isManualRate) {
      rate = roundedWeight > 0 ? calc.total / roundedWeight : config.parcelSlab1Rate;
      amount = calc.total;
      breakdown = calc.breakdown;
    } else {
      amount = rate * roundedWeight;
      breakdown = `${roundedWeight}kg * ${rate} (Manual)`;
    }
  }

  return {
    ...row,
    rate,
    isManualRate,
    amount,
    breakdown
  };
}