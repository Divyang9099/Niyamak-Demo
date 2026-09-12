const { calculate } = require('../../src/domains/estimation/costEngine.service');

describe('costEngine.calculate', () => {
  test('computes resource costs (days × rate × count)', () => {
    const r = calculate({ days: 7, pilot_rate: 16000, drone_rate: 25000 });
    expect(r.pilotCost).toBe(7 * 16000); // 112000
    expect(r.droneCost).toBe(7 * 25000); // 175000
  });

  test('road mobilization = rate × distance × mobilizations × team_size', () => {
    const r = calculate({
      travel_mode: 'road', travel_rate: 12, distance_km: 650,
      mobilizations: 2, team_size: 1,
    });
    expect(r.mobilizationCost).toBe(12 * 650 * 2 * 1); // 15600
  });

  test('air mobilization = rate × mobilizations × team_size (no distance)', () => {
    const r = calculate({
      travel_mode: 'air', travel_rate: 8500, mobilizations: 2, team_size: 3,
    });
    expect(r.mobilizationCost).toBe(8500 * 2 * 3); // 51000
  });

  test('accommodation = nights × rate (no team_size)', () => {
    const r = calculate({ accommodation_nights: 9, accommodation_rate: 3000, team_size: 3 });
    expect(r.accommodationCost).toBe(9 * 3000);
  });

  test('per diem = rate × team_size × on_site_days', () => {
    const r = calculate({ per_diem_rate: 1500, team_size: 2, on_site_days: 10 });
    expect(r.perDiem).toBe(1500 * 2 * 10); // 30000
  });

  test('deliverable_items sum into deliverableCost with a breakdown', () => {
    const r = calculate({
      deliverable_items: [
        { key: 'orthomosaic', quantity: 2, unit_cost: 3000 },
        { key: 'point_cloud', quantity: 1, unit_cost: 4500 },
      ],
    });
    expect(r.deliverableCost).toBe(2 * 3000 + 4500); // 10500
    expect(r.deliverableBreakdown).toHaveLength(2);
    expect(r.deliverableBreakdown[0].line_total).toBe(6000);
  });

  test('overhead → contingency → margin → tax compound in the correct order', () => {
    const r = calculate({
      days: 1, pilot_rate: 1000,         // directCosts = 1000
      overhead_percent: 10,              // +100  => 1100
      contingency_percent: 5,            // +55   => 1155
      margin_percent: 20,                // +231  => 1386
      tax_percent: 18,                   // +249.48 => 1635.48
    });
    expect(r.directCosts).toBe(1000);
    expect(r.overhead).toBeCloseTo(100, 5);
    expect(r.contingency).toBeCloseTo(55, 5);
    expect(r.productionCost).toBeCloseTo(1155, 5);
    expect(r.margin).toBeCloseTo(231, 5);
    expect(r.subtotal).toBeCloseTo(1386, 5);
    expect(r.tax).toBeCloseTo(249.48, 5);
    expect(r.total).toBeCloseTo(1635.48, 5);
  });

  test('contingency defaults to 5% when not supplied', () => {
    const r = calculate({ days: 1, pilot_rate: 1000 });
    expect(r.contingencyPercent).toBe(5);
  });

  test('negative / NaN inputs are coerced to safe zero', () => {
    const r = calculate({ days: -7, pilot_rate: 'abc', drone_rate: null });
    expect(r.pilotCost).toBe(0);
    expect(r.droneCost).toBe(0);
  });

  test('full PRD-style estimation lands near the expected grand total', () => {
    const r = calculate({
      days: 7, pilot_rate: 16000, drone_rate: 25000, team_size: 3,
      travel_mode: 'road', travel_rate: 12, distance_km: 650, mobilizations: 2,
      accommodation_nights: 9, accommodation_rate: 3000,
      per_diem_rate: 1500, on_site_days: 10,
      overhead_percent: 15, contingency_percent: 5, margin_percent: 20, tax_percent: 18,
    });
    // Direct: pilot 112000 + drone 175000 + mobilization(12×650×2×3)=46800
    //         + accommodation(9×3000)=27000 + per-diem(1500×3×10)=45000 = 405800
    expect(r.directCosts).toBeCloseTo(405800, 0);
    expect(r.total).toBeGreaterThan(405800); // after overhead/margin/tax
  });

  test('unitRate is total / scope_quantity when scope provided, else null', () => {
    const withScope = calculate({ days: 1, pilot_rate: 1000, scope_quantity: 10 });
    expect(withScope.unitRate).toBeCloseTo(withScope.total / 10, 5);
    const noScope = calculate({ days: 1, pilot_rate: 1000 });
    expect(noScope.unitRate).toBeNull();
  });
});
