/**
 * Cost engine v2 — mirrors backend `costEngine.service.js` exactly so the live
 * preview in the form matches what the server will store. If you change one,
 * change the other.
 *
 * Type-specific defaults (days, processing_cost) are still derived here so the
 * user sees an initial estimate before adjusting parameters.
 */

const safe = (v, def = 0) => {
  const n = Number(v);
  return (isNaN(n) || n < 0) ? def : n;
};

// ── Type-specific quick defaults (auto-fill days + processing) ──────────────
const deriveTypeDefaults = (inputs) => {
  const type = (inputs.project_type || '').toLowerCase();
  let days = safe(inputs.days);
  let processing = safe(inputs.processing_cost);

  if (!inputs.days) {
    if (type === 'solar' || type === 'solar_pv') {
      const mw = safe(inputs.mw);
      days = Math.ceil(mw / 5);
      if (!inputs.processing_cost) processing = mw * 1500;
    } else if (type === 'wind') {
      const turbines = safe(inputs.turbines);
      days = Math.ceil(turbines / 3);
      if (!inputs.processing_cost) processing = turbines * 2500;
    } else if (type === 'transmission' || type === 'td_lines' || type === 't&d') {
      const km = safe(inputs.km);
      days = Math.ceil(km / 8);
      if (!inputs.processing_cost) processing = km * 800;
    } else if (type === 'pipeline') {
      const km = safe(inputs.km);
      days = Math.ceil(km / 12);
      if (!inputs.processing_cost) processing = km * 600;
    } else if (type === 'volumetric') {
      const stockpiles = safe(inputs.stockpiles);
      days = Math.ceil(stockpiles / 6);
      if (!inputs.processing_cost) processing = stockpiles * 1200;
    } else if (type === 'tower') {
      const towers = safe(inputs.towers);
      days = Math.ceil(towers / 4);
      if (!inputs.processing_cost) processing = towers * 2000;
    }
  }

  return { days, processing };
};

export function calcCost(inputs) {
  const { days: autoDays, processing: autoProcessing } = deriveTypeDefaults(inputs);
  const days = autoDays;
  const processingCost = autoProcessing;

  // ── Resource costs ─────────────────────────────────────────────────────
  const pilotRate    = safe(inputs.pilot_rate);
  const droneRate    = safe(inputs.drone_rate);
  const copilotRate  = safe(inputs.copilot_rate);
  const pilotCount   = safe(inputs.pilots_count, 1);
  const droneCount   = safe(inputs.drones_count, 1);
  const copilotCount = safe(inputs.copilot_count, 0);
  const teamSize     = safe(inputs.team_size, pilotCount || 1);

  const pilotCost   = days * pilotRate * pilotCount;
  const copilotCost = days * copilotRate * copilotCount;
  const droneCost   = days * droneRate * droneCount;

  // ── Mobilization ───────────────────────────────────────────────────────
  const travelMode    = (inputs.travel_mode || '').toLowerCase();
  const travelRate    = safe(inputs.travel_rate);
  const distanceKm    = safe(inputs.distance_km);
  const mobilizations = safe(inputs.mobilizations, 1);
  let mobilizationCost;
  if (inputs.travel_cost !== undefined && inputs.travel_cost !== '') {
    mobilizationCost = safe(inputs.travel_cost);
  } else if (travelMode === 'air') {
    mobilizationCost = travelRate * mobilizations * teamSize;
  } else {
    mobilizationCost = travelRate * distanceKm * mobilizations * teamSize;
  }

  // ── Accommodation (no team-size multiplier) ────────────────────────────
  let accommodationCost;
  if (inputs.accommodation_cost !== undefined && inputs.accommodation_cost !== '') {
    accommodationCost = safe(inputs.accommodation_cost);
  } else {
    const nights = safe(inputs.accommodation_nights);
    const acRate = safe(inputs.accommodation_rate);
    accommodationCost = nights * acRate;
  }

  // ── Daily Travel (local vehicle / per-day travel, no team-size multiplier)
  let dailyTravelCost;
  if (inputs.daily_travel_cost !== undefined && inputs.daily_travel_cost !== '') {
    dailyTravelCost = safe(inputs.daily_travel_cost);
  } else {
    const dtDays = safe(inputs.daily_travel_days);
    const dtRate = safe(inputs.daily_travel_rate);
    dailyTravelCost = dtDays * dtRate;
  }

  // ── Per Diem (auto: team × days × rate) ────────────────────────────────
  let perDiem;
  if (inputs.per_diem !== undefined && inputs.per_diem !== '' &&
      (inputs.per_diem_rate === undefined || inputs.per_diem_rate === '')) {
    perDiem = safe(inputs.per_diem);
  } else {
    const pdRate = safe(inputs.per_diem_rate);
    const onSiteDays = safe(inputs.on_site_days, days);
    perDiem = pdRate * teamSize * onSiteDays;
  }

  const softwareCost = safe(inputs.software_cost);

  // ── Deliverable line items ─────────────────────────────────────────────
  let deliverableCost;
  let deliverableBreakdown = [];
  if (Array.isArray(inputs.deliverable_items) && inputs.deliverable_items.length) {
    deliverableBreakdown = inputs.deliverable_items.map(it => {
      const qty = safe(it.quantity, 1);
      const unit = safe(it.unit_cost);
      return {
        key:        it.key || it.name || 'item',
        label:      it.label || it.name || it.key || 'item',
        quantity:   qty,
        unit_cost:  unit,
        prep_hours: safe(it.prep_hours),
        line_total: qty * unit,
      };
    });
    deliverableCost = deliverableBreakdown.reduce((s, x) => s + x.line_total, 0);
  } else {
    deliverableCost = safe(inputs.deliverable_cost);
  }

  // ── Report writing & storage ──────────────────────────────────────────
  const reportHours = safe(inputs.report_writing_hours);
  const reportRate  = safe(inputs.report_writing_rate);
  const reportWritingCost = inputs.report_writing_cost !== undefined && inputs.report_writing_cost !== ''
    ? safe(inputs.report_writing_cost)
    : reportHours * reportRate;
  const storageCost = safe(inputs.storage_cost);

  // ── Direct costs ──────────────────────────────────────────────────────
  const directCost = pilotCost + copilotCost + droneCost + mobilizationCost +
                     accommodationCost + dailyTravelCost + perDiem + softwareCost +
                     deliverableCost + reportWritingCost + storageCost +
                     processingCost;

  // ── Markups ───────────────────────────────────────────────────────────
  const overheadPercent    = safe(inputs.overhead_percent);
  const overhead           = (directCost * overheadPercent) / 100;
  const baseCost           = directCost + overhead;

  const contingencyPercent = safe(inputs.contingency_percent, 5);
  const contingency        = (baseCost * contingencyPercent) / 100;
  const productionCost     = baseCost + contingency;

  const marginPercent = safe(inputs.margin_percent, 10);
  const margin        = (productionCost * marginPercent) / 100;
  const subtotal      = productionCost + margin;

  const taxPercent = safe(inputs.tax_percent, 18);
  const tax        = (subtotal * taxPercent) / 100;
  const total      = subtotal + tax;

  const scopeQuantity = safe(inputs.scope_quantity);
  const unitRate = scopeQuantity > 0 ? total / scopeQuantity : null;

  // ── Smart unit rate — auto-derives scope quantity from project-type fields ──
  // Returns { value, label } or null when no scope param is available.
  const getUnitRate = () => {
    const type = (inputs.project_type || '').toLowerCase();
    // Use excl-GST subtotal as the basis (quoted value)
    const basis = subtotal;
    if (basis <= 0) return null;

    if (type === 'solar' || type === 'solar_pv') {
      const mw = safe(inputs.mw);
      if (mw > 0) return { value: basis / mw, label: 'MW', labelFull: `₹/MW` };
      const acres = safe(inputs.area_acres);
      if (acres > 0) return { value: basis / acres, label: 'Acre', labelFull: `₹/Acre` };
    }
    if (type === 'wind') {
      const turbines = safe(inputs.turbines);
      if (turbines > 0) return { value: basis / turbines, label: 'Turbine', labelFull: `₹/Turbine` };
    }
    if (type === 'transmission' || type === 'td_lines' || type === 't&d') {
      const km = safe(inputs.km);
      if (km > 0) return { value: basis / km, label: 'km', labelFull: `₹/km` };
    }
    if (type === 'pipeline') {
      const km = safe(inputs.km);
      if (km > 0) return { value: basis / km, label: 'km', labelFull: `₹/km` };
    }
    if (type === 'volumetric') {
      const stockpiles = safe(inputs.stockpiles);
      if (stockpiles > 0) return { value: basis / stockpiles, label: 'Stockpile', labelFull: `₹/Stockpile` };
    }
    if (type === 'tower') {
      const towers = safe(inputs.towers);
      if (towers > 0) return { value: basis / towers, label: 'Tower', labelFull: `₹/Tower` };
    }
    // Generic fallback: use scope_quantity if manually set
    if (scopeQuantity > 0) return { value: basis / scopeQuantity, label: 'Unit', labelFull: `₹/Unit` };
    // Universal fallback: cost per flight day — always meaningful for drone surveys
    if (days > 0) return { value: basis / days, label: 'Flight Day', labelFull: `₹/Day` };
    return null;
  };

  const smartUnitRate = getUnitRate();

  return {
    days,
    pilotCost, copilotCost, droneCost,
    copilotCount, pilotCount: pilotCount, droneCount,
    mobilizationCost,
    accommodationCost,
    dailyTravelCost,
    perDiem,
    softwareCost,
    deliverableCost, deliverableBreakdown,
    reportWritingCost, reportHours,
    storageCost,
    processing_cost: processingCost,
    directCost,
    overhead, overhead_percent: overheadPercent,
    contingency, contingency_percent: contingencyPercent,
    baseCost,
    productionCost,
    margin, margin_percent: marginPercent,
    subtotal,
    tax, tax_percent: taxPercent,
    total,
    unitRate, scopeQuantity,
    smartUnitRate,
    teamSize,
  };
}
