import { describe, it, expect } from 'vitest';
import { calcCost } from './costEngine';

describe('Cost Engine (calcCost)', () => {
  it('should calculate base cost correctly', () => {
    const inputs = {
      days: 10,
      pilot_rate: 1000,
      drone_rate: 500,
      travel_cost: 200,
      processing_cost: 300,
      margin_percent: 0,
      tax_percent: 0
    };
    const result = calcCost(inputs);
    // (10 * 1000) + (10 * 500) + 200 + 300 = 10000 + 5000 + 500 = 15500
    expect(result.baseCost).toBe(15500);
    expect(result.total).toBe(15500);
  });

  it('should calculate margin correctly', () => {
    const inputs = {
      days: 1,
      pilot_rate: 1000,
      drone_rate: 0,
      travel_cost: 0,
      processing_cost: 0,
      margin_percent: 10,
      tax_percent: 0
    };
    const result = calcCost(inputs);
    // base = 1000, margin = 100, subtotal = 1100
    expect(result.margin).toBe(100);
    expect(result.subtotal).toBe(1100);
    expect(result.total).toBe(1100);
  });

  it('should calculate tax correctly', () => {
    const inputs = {
      days: 1,
      pilot_rate: 1000,
      drone_rate: 0,
      travel_cost: 0,
      processing_cost: 0,
      margin_percent: 10,
      tax_percent: 18
    };
    const result = calcCost(inputs);
    // base = 1000, margin = 100, subtotal = 1100, tax = 1100 * 0.18 = 198
    expect(result.tax).toBe(198);
    expect(result.total).toBe(1298);
  });

  it('should handle empty or null inputs gracefully using defaults', () => {
    const result = calcCost({});
    expect(result.total).toBe(0);
    expect(result.baseCost).toBe(0);
  });
});
