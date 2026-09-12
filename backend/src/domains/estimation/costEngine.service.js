/**
 * Cost Engine v2 — pure calculation, no DB calls.
 *
 * Inputs accept richer per-line structures (PRD §7.3.3–7.3.7). Legacy flat
 * fields are still honored for backward compatibility with v1 callers.
 *
 *   Auto-derived if not passed directly:
 *     per_diem           = team_size × on_site_days × per_diem_rate
 *     accommodation_cost = nights × accommodation_rate (no team-size multiplier)
 *     daily_travel_cost  = daily_travel_days × daily_travel_rate (no team-size)
 *     mobilization_cost  = (travel_rate × distance_km × mobilizations × team_size)
 *                          OR (travel_rate × mobilizations × team_size) for air
 *     deliverable_cost   = Σ(deliverable_items[i].quantity × unit_cost)
 *     report_writing_cost= report_writing_hours × report_writing_rate
 *     storage_cost       = passed as-is
 */
exports.calculate = (data) => {
  const safe = (v, def = 0) => {
    const n = Number(v);
    return (isNaN(n) || n < 0) ? def : n;
  };

  // ── Resource costs ────────────────────────────────────────────────────
  const days         = safe(data.days);
  const pilotRate    = safe(data.pilot_rate);
  const droneRate    = safe(data.drone_rate);
  const copilotRate  = safe(data.copilot_rate);
  const pilotCount   = safe(data.pilots_count, 1);
  const droneCount   = safe(data.drones_count, 1);
  const copilotCount = safe(data.copilot_count, 0);
  const postProcessingDays = safe(data.post_processing_days);

  const pilotCost   = days * pilotRate * pilotCount;
  const copilotCost = days * copilotRate * copilotCount;
  const droneCost   = days * droneRate * droneCount;

  // ── Mobilization (PRD §7.3.3) ─────────────────────────────────────────
  // Inputs: travel_mode ('road'|'rail'|'air'), travel_rate (per km or per trip),
  // distance_km, mobilizations, team_size
  const travelMode    = (data.travel_mode || '').toLowerCase();
  const travelRate    = safe(data.travel_rate);            // ₹/km or ₹/trip
  const distanceKm    = safe(data.distance_km);
  const mobilizations = safe(data.mobilizations, 1);
  const teamSize      = safe(data.team_size, pilotCount || 1);

  let mobilizationCost;
  if (data.travel_cost !== undefined && data.travel_cost !== '') {
    // legacy / explicit override
    mobilizationCost = safe(data.travel_cost);
  } else if (travelMode === 'air') {
    // per-trip × mobilizations × team_size (round trip)
    mobilizationCost = travelRate * mobilizations * teamSize;
  } else {
    // per-km × distance × mobilizations × team_size (road/rail)
    mobilizationCost = travelRate * distanceKm * mobilizations * teamSize;
  }

  // ── Accommodation (no team-size multiplier) ───────────────────────────
  let accommodationCost;
  if (data.accommodation_cost !== undefined && data.accommodation_cost !== '') {
    accommodationCost = safe(data.accommodation_cost);
  } else {
    const nights = safe(data.accommodation_nights);
    const acRate = safe(data.accommodation_rate);
    accommodationCost = nights * acRate;
  }

  // ── Daily Travel (local vehicle / per-day rate, no team-size multiplier)
  let dailyTravelCost;
  if (data.daily_travel_cost !== undefined && data.daily_travel_cost !== '') {
    dailyTravelCost = safe(data.daily_travel_cost);
  } else {
    const dtDays = safe(data.daily_travel_days);
    const dtRate = safe(data.daily_travel_rate);
    dailyTravelCost = dtDays * dtRate;
  }

  // ── Per Diem (auto-calculated based on team size and days) ────────────
  // Inputs: per_diem_rate (per person per day) — auto: × team_size × days
  let perDiem;
  if (data.per_diem !== undefined && data.per_diem !== '' &&
      (data.per_diem_rate === undefined || data.per_diem_rate === '')) {
    // explicit flat override (only when no per_diem_rate is set)
    perDiem = safe(data.per_diem);
  } else {
    const pdRate = safe(data.per_diem_rate);
    const onSiteDays = safe(data.on_site_days, days);
    perDiem = pdRate * teamSize * onSiteDays;
  }

  // ── Software licenses (PRD §7.3.4) ────────────────────────────────────
  const softwareCost = safe(data.software_cost);

  // ── Deliverables (PRD §7.3.5) ─────────────────────────────────────────
  // New shape:   deliverable_items: [{ key, quantity, unit_cost, prep_hours }]
  // Legacy flat: deliverable_cost
  let deliverableCost;
  let deliverableBreakdown = [];
  if (Array.isArray(data.deliverable_items) && data.deliverable_items.length) {
    deliverableBreakdown = data.deliverable_items.map((it) => {
      const qty  = safe(it.quantity, 1);
      const cost = safe(it.unit_cost);
      const lineTotal = qty * cost;
      return {
        key: it.key || it.name || 'item',
        label: it.label || it.name || it.key || 'item',
        quantity: qty,
        unit_cost: cost,
        prep_hours: safe(it.prep_hours),
        line_total: lineTotal,
      };
    });
    deliverableCost = deliverableBreakdown.reduce((s, x) => s + x.line_total, 0);
  } else {
    deliverableCost = safe(data.deliverable_cost);
  }

  // ── Report writing (PRD §7.3.5) ───────────────────────────────────────
  const reportHours = safe(data.report_writing_hours);
  const reportRate  = safe(data.report_writing_rate);
  const reportWritingCost = data.report_writing_cost !== undefined && data.report_writing_cost !== ''
    ? safe(data.report_writing_cost)
    : reportHours * reportRate;

  // ── Data storage & transfer (PRD §7.3.5) ──────────────────────────────
  const storageCost = safe(data.storage_cost);

  // ── Legacy processing cost (kept for back-compat) ─────────────────────
  const processingCost = safe(data.processing_cost);

  // ── Direct costs total ────────────────────────────────────────────────
  const directCosts = pilotCost + copilotCost + droneCost + mobilizationCost +
                      accommodationCost + dailyTravelCost + perDiem + softwareCost +
                      deliverableCost + reportWritingCost + storageCost +
                      processingCost;

  // ── Overhead → contingency → margin → tax (PRD §7.3.6) ────────────────
  const overheadPercent    = safe(data.overhead_percent);
  const overhead           = (directCosts * overheadPercent) / 100;
  const costBeforeContingency = directCosts + overhead;

  const contingencyPercent = safe(data.contingency_percent, 5); // PRD default
  const contingency        = (costBeforeContingency * contingencyPercent) / 100;
  const productionCost     = costBeforeContingency + contingency;

  const marginPercent = safe(data.margin_percent);
  const margin        = (productionCost * marginPercent) / 100;
  const subtotal      = productionCost + margin;

  const taxPercent = safe(data.tax_percent);
  const tax        = (subtotal * taxPercent) / 100;
  const total      = subtotal + tax;

  // Unit rate (PRD §7.3.7) — cost per scope unit when scope_quantity provided
  const scopeQuantity = safe(data.scope_quantity);
  const unitRate = scopeQuantity > 0 ? total / scopeQuantity : null;

  return {
    // resource
    pilotCost,
    copilotCost,
    droneCost,
    pilotsCount:   pilotCount,
    copilotCount,
    dronesCount:   droneCount,
    days,
    postProcessingDays,
    // mobilization
    mobilizationCost,
    travelCost: mobilizationCost, // alias for legacy callers
    // accommodation, daily travel & per diem
    accommodationCost,
    dailyTravelCost,
    perDiem,
    teamSize,
    // software, deliverables, report, storage, legacy processing
    softwareCost,
    deliverableCost,
    deliverableBreakdown,
    reportWritingCost,
    reportWritingHours: reportHours,
    storageCost,
    processingCost,
    // rollup
    directCosts,
    overheadPercent,
    overhead,
    contingencyPercent,
    contingency,
    productionCost,
    marginPercent,
    margin,
    subtotal,
    taxPercent,
    tax,
    total,
    unitRate,
    scopeQuantity,
  };
};
