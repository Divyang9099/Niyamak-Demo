/**
 * ═══════════════════════════════════════════════════════════════════════
 *  DEMO DATA SEEDER — Niyamak / Varuna Ops
 * ═══════════════════════════════════════════════════════════════════════
 * Populates the ISOLATED DEMO Neon database with a realistic, internally
 * consistent, 100% fictional dataset for a drone-service company
 * ("SkyArc Aerial Solutions") so every major screen has real data to show.
 *
 * SAFETY: refuses to run unless backend/.env DB_HOST is a known demo host
 * (see lib/guard.js). It never reads or writes production.
 *
 * Usage:  node database/demo/seed-demo.js
 * Undo:   node database/demo/reset-demo.js
 *
 * Idempotency: running this twice without reset in between will fail on
 * unique constraints (by design — it does not silently duplicate data).
 * Always run reset-demo.js first if you want a clean re-seed.
 */
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const { assertDemoDatabase, assertDemoBucket } = require('./lib/guard');
assertDemoDatabase();
assertDemoBucket();

const costEngine = require('../../src/domains/estimation/costEngine.service');
const { putBuffer, makePdf, makePng, makeKml } = require('./lib/files');

const pool = new Pool({
  host: process.env.DB_HOST, port: +process.env.DB_PORT, database: process.env.DB_NAME,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

const uid = () => crypto.randomUUID();
const DEMO_PASSWORD = 'Demo@12345';
const TODAY = new Date('2026-09-11T00:00:00Z');
const iso = (d) => d.toISOString().slice(0, 10);
const daysFromToday = (n) => { const d = new Date(TODAY); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

let q; // set to client.query once connected, used by all seed* functions

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log(' Seeding DEMO data →', process.env.DB_HOST);
  console.log(' Bucket             →', process.env.R2_BUCKET);
  console.log('═══════════════════════════════════════════════════════\n');

  const client = await pool.connect();
  q = (text, params) => client.query(text, params);

  try {
    await q('BEGIN');

    const ids = {};
    await seedCompanyConfig();
    await seedUsers(ids);
    await seedPilotsAndDrones(ids);
    await seedClients(ids);
    await seedAssets(ids);
    await seedBD(ids);
    await seedPipeline(ids);
    await seedProjects(ids);              // members, allocations, scope, maps
    await seedEstimations(ids);
    await seedDeliverablesAndDocs(ids);   // uses real R2 files
    await seedExpensesAndInvoices(ids);
    await seedLibrary(ids);
    await seedAttendancePayroll(ids);
    await seedCalendarAndNotifications(ids);
    await seedActivityLog(ids);

    await q('COMMIT');
    console.log('\n✅ COMMIT — all demo data written successfully.');
  } catch (err) {
    await q('ROLLBACK');
    console.error('\n❌ Seed failed — transaction rolled back, database unchanged.');
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 1. COMPANY CONFIG (white-label branding used across the whole app)
// ═══════════════════════════════════════════════════════════════════════
async function seedCompanyConfig() {
  await q(`
    UPDATE company_config SET
      company_name = 'SkyArc Aerial Solutions Pvt. Ltd.',
      address = 'Plot 14, Aerospace Business Park, Hinjewadi Phase 2, Pune, Maharashtra 411057',
      gstin = '27SKYAR9034F1Z5',
      cin = 'U62099PN2019PTC198765',
      primary_contact_email = 'ops@skyarc-demo.example',
      primary_contact_phone = '+91 98200 11223'
  `);
  console.log('✓ company_config branded as SkyArc Aerial Solutions (fictional)');
}

// ═══════════════════════════════════════════════════════════════════════
// 2. USERS
// ═══════════════════════════════════════════════════════════════════════
async function seedUsers(ids) {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const users = [
    { key: 'admin', name: 'Aditi Rao',      email: 'admin@skyarc-demo.example',    role: 'admin',           phone: '+91 90000 10001' },
    { key: 'pm1',   name: 'Rohan Mehta',    email: 'rohan.mehta@skyarc-demo.example',    role: 'project_manager', phone: '+91 90000 10002' },
    { key: 'pm2',   name: 'Sneha Kulkarni', email: 'sneha.kulkarni@skyarc-demo.example', role: 'project_manager', phone: '+91 90000 10003' },
    { key: 'pilot1', name: 'Arjun Nair',    email: 'arjun.nair@skyarc-demo.example',     role: 'pilot', phone: '+91 90000 10011' },
    { key: 'pilot2', name: 'Kabir Singh',   email: 'kabir.singh@skyarc-demo.example',    role: 'pilot', phone: '+91 90000 10012' },
    { key: 'pilot3', name: 'Meera Iyer',    email: 'meera.iyer@skyarc-demo.example',     role: 'pilot', phone: '+91 90000 10013' },
    { key: 'pilot4', name: 'Vikram Desai',  email: 'vikram.desai@skyarc-demo.example',   role: 'pilot', phone: '+91 90000 10014' },
    { key: 'pilot5', name: 'Ananya Joshi',  email: 'ananya.joshi@skyarc-demo.example',   role: 'pilot', phone: '+91 90000 10015' },
    { key: 'copilot1', name: 'Farhan Sheikh', email: 'farhan.sheikh@skyarc-demo.example', role: 'co_pilot', phone: '+91 90000 10021' },
    { key: 'copilot2', name: 'Priya Nambiar', email: 'priya.nambiar@skyarc-demo.example', role: 'co_pilot', phone: '+91 90000 10022' },
  ];

  for (const u of users) {
    const id = uid();
    ids[`user_${u.key}`] = id;
    await q(
      `INSERT INTO users (id, name, email, password_hash, role, phone) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, u.name, u.email, hash, u.role, u.phone]
    );
  }
  console.log(`✓ ${users.length} users created (admin + 2 PMs + 5 pilots + 2 co-pilots)`);
}

// ═══════════════════════════════════════════════════════════════════════
// 3. PILOTS & DRONES
// ═══════════════════════════════════════════════════════════════════════
async function seedPilotsAndDrones(ids) {
  const pilots = [
    { key: 'pilot1', userKey: 'user_pilot1', emp: 'SKA-PLT-001', crew: 'pilot', license_expiry: daysFromToday(650), base: 'Pune, Maharashtra', rate: 4500, designation: 'Senior Drone Pilot', joined: '2022-03-14', certs: ['DGCA Remote Pilot Certificate', 'Small Category RPC'] },
    { key: 'pilot2', userKey: 'user_pilot2', emp: 'SKA-PLT-002', crew: 'pilot', license_expiry: daysFromToday(18),  base: 'Mumbai, Maharashtra', rate: 4200, designation: 'Drone Pilot', joined: '2023-01-09', certs: ['DGCA Remote Pilot Certificate'] }, // expiring soon → compliance alert
    { key: 'pilot3', userKey: 'user_pilot3', emp: 'SKA-PLT-003', crew: 'pilot', license_expiry: daysFromToday(400), base: 'Ahmedabad, Gujarat', rate: 4000, designation: 'Drone Pilot', joined: '2023-06-01', certs: ['DGCA Remote Pilot Certificate', 'Thermal Imaging Cert.'] },
    { key: 'pilot4', userKey: 'user_pilot4', emp: 'SKA-PLT-004', crew: 'pilot', license_expiry: daysFromToday(220), base: 'Jaipur, Rajasthan', rate: 4100, designation: 'Drone Pilot', joined: '2024-02-19', certs: ['DGCA Remote Pilot Certificate'] },
    { key: 'pilot5', userKey: 'user_pilot5', emp: 'SKA-PLT-005', crew: 'pilot', license_expiry: daysFromToday(500), base: 'Chennai, Tamil Nadu', rate: 4300, designation: 'Senior Drone Pilot', joined: '2021-11-05', certs: ['DGCA Remote Pilot Certificate', 'BVLOS Level 2'] },
    { key: 'copilot1', userKey: 'user_copilot1', emp: 'SKA-CPT-001', crew: 'co_pilot', license_expiry: daysFromToday(300), base: 'Pune, Maharashtra', rate: 2500, designation: 'Co-Pilot / Camera Operator', joined: '2023-08-21', certs: ['Ground Crew Safety Cert.'] },
    { key: 'copilot2', userKey: 'user_copilot2', emp: 'SKA-CPT-002', crew: 'co_pilot', license_expiry: daysFromToday(300), base: 'Mumbai, Maharashtra', rate: 2400, designation: 'Co-Pilot / Camera Operator', joined: '2024-04-10', certs: ['Ground Crew Safety Cert.'] },
  ];

  for (const p of pilots) {
    const id = uid();
    ids[`pilot_${p.key}`] = id;
    await q(
      `INSERT INTO pilots
       (id, user_id, employee_id, license_number, license_expiry, base_location, per_day_rate,
        certifications, status, contact_number, joining_date, employment_type, designation, crew_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10,'full_time',$11,$12)`,
      [id, ids[p.userKey], p.emp, `DGCA-RPC-${p.emp.slice(-3)}-2021`, p.license_expiry, p.base, p.rate,
       JSON.stringify(p.certs), null, p.joined, p.designation, p.crew]
    );
  }
  // contact_number: fill from users table for realism (pilots.contact_number left null above, backfill)
  await q(`UPDATE pilots pl SET contact_number = u.phone FROM users u WHERE pl.user_id = u.id AND pl.contact_number IS NULL`);
  console.log(`✓ ${pilots.length} pilot/co-pilot profiles created`);

  const drones = [
    { key: 'd1', name: 'Sky-01', make: 'DJI', model: 'Matrice 350 RTK', serial: 'M350-SK-0001', uin: 'UIN-MH-SKY-00101', day_rate: 8000, status: 'active', insurance: daysFromToday(210), sensors: { rgb: 'Zenmuse P1', thermal: 'Zenmuse H20T' } },
    { key: 'd2', name: 'Sky-02', make: 'DJI', model: 'Matrice 300 RTK', serial: 'M300-SK-0002', uin: 'UIN-MH-SKY-00102', day_rate: 7000, status: 'active', insurance: daysFromToday(22), sensors: { rgb: 'Zenmuse P1' } }, // insurance expiring soon
    { key: 'd3', name: 'Sky-03', make: 'DJI', model: 'Mavic 3 Enterprise', serial: 'M3E-SK-0003', uin: 'UIN-MH-SKY-00103', day_rate: 3500, status: 'active', insurance: daysFromToday(300), sensors: { rgb: 'Mechanical Shutter Cam' } },
    { key: 'd4', name: 'Wing-01', make: 'senseFly', model: 'eBee X', serial: 'EBX-SK-0004', uin: 'UIN-MH-SKY-00104', day_rate: 9000, status: 'active', insurance: daysFromToday(365), sensors: { rgb: 'S.O.D.A. 3D' } },
    { key: 'd5', name: 'Sky-05', make: 'DJI', model: 'Matrice 30T', serial: 'M30T-SK-0005', uin: 'UIN-MH-SKY-00105', day_rate: 6500, status: 'maintenance', insurance: daysFromToday(150), sensors: { thermal: 'Built-in Wide + Thermal' } },
    { key: 'd6', name: 'Sky-06', make: 'Autel', model: 'EVO Max 4T', serial: 'EM4T-SK-0006', uin: 'UIN-MH-SKY-00106', day_rate: 5000, status: 'retired', insurance: daysFromToday(-40), sensors: { thermal: 'Infrared 640' } },
  ];
  for (const d of drones) {
    const id = uid();
    ids[`drone_${d.key}`] = id;
    await q(
      `INSERT INTO drones (id, name, make, model, serial_number, sensor_payloads, uin, day_rate, insurance_expiry, last_maintenance, next_maintenance, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, d.name, d.make, d.model, d.serial, JSON.stringify(d.sensors), d.uin, d.day_rate, d.insurance,
       daysFromToday(-60), daysFromToday(d.status === 'maintenance' ? 5 : 90), d.status]
    );
  }
  console.log(`✓ ${drones.length} drones created`);

  await q(
    `INSERT INTO drone_maintenance_logs (drone_id, maintenance_type, description, performed_by, performed_at, next_due, cost)
     VALUES ($1,'routine_service','Gimbal calibration and firmware update','SkyArc Ground Crew',$2,$3,4200)`,
    [ids.drone_d5, daysFromToday(-10), daysFromToday(5)]
  );
  console.log('✓ 1 drone maintenance log created');
}

// ═══════════════════════════════════════════════════════════════════════
// 4. CLIENTS (core CRM used by projects/invoices)
// ═══════════════════════════════════════════════════════════════════════
async function seedClients(ids) {
  const clients = [
    { key: 'solaris', name: 'Solaris Green Energy Pvt Ltd', contact: 'Nikhil Bansal', email: 'nikhil.bansal@solarisgreen-demo.example', phone: '+91 98765 40001', city: 'Kolhapur', state: 'Maharashtra', gstin: '27SOLAR1122F1Z1', status: 'active' },
    { key: 'windforce', name: 'Windforce Renewables Ltd', contact: 'Kavya Reddy', email: 'kavya.reddy@windforce-demo.example', phone: '+91 98765 40002', city: 'Satara', state: 'Maharashtra', gstin: '27WINDF3344F1Z2', status: 'active' },
    { key: 'powergrid', name: 'PowerGrid Bhoomi Transmission Co', contact: 'Suresh Pillai', email: 'suresh.pillai@pgbhoomi-demo.example', phone: '+91 98765 40003', city: 'Nashik', state: 'Maharashtra', gstin: '27POWER5566F1Z3', status: 'active' },
    { key: 'teletower', name: 'TeleTower Infra Services', contact: 'Rina D’Souza', email: 'rina.dsouza@teletower-demo.example', phone: '+91 98765 40004', city: 'Mumbai', state: 'Maharashtra', gstin: '27TELET7788F1Z4', status: 'active' },
    { key: 'natpipe', name: 'NationalPipe Energy Corp', contact: 'Manoj Trivedi', email: 'manoj.trivedi@natpipe-demo.example', phone: '+91 98765 40005', city: 'Vadodara', state: 'Gujarat', gstin: '24NATPI9900F1Z5', status: 'active' },
    { key: 'metroinfra', name: 'Metro Infra Developers', contact: 'Alok Bhatt', email: 'alok.bhatt@metroinfra-demo.example', phone: '+91 98765 40006', city: 'Nagpur', state: 'Maharashtra', gstin: '27METRO1234F1Z6', status: 'inactive' },
  ];
  for (const c of clients) {
    const id = uid();
    ids[`client_${c.key}`] = id;
    await q(
      `INSERT INTO clients (id, name, company_name, contact_person, contact_email, contact_number, gstin, city, state, status, created_by)
       VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, c.name, c.contact, c.email, c.phone, c.gstin, c.city, c.state, c.status, ids.user_admin]
    );
  }
  console.log(`✓ ${clients.length} clients created`);
}

// ═══════════════════════════════════════════════════════════════════════
// 5. ASSETS
// ═══════════════════════════════════════════════════════════════════════
async function seedAssets(ids) {
  const assets = [
    { name: 'RTK Base Station Kit #1', type: 'ground_equipment', model: 'D-RTK 2', status: 'active' },
    { name: 'Intelligent Battery Set A (6x)', type: 'battery', model: 'TB65 High-Capacity', status: 'active' },
    { name: 'Intelligent Battery Set B (6x)', type: 'battery', model: 'TB65 High-Capacity', status: 'in_use', assign: 'proj_solaris_kolhapur' },
    { name: 'Ground Control Points Kit', type: 'ground_equipment', model: '20x GCP markers + tablet', status: 'active' },
    { name: 'Rugged Field Laptop', type: 'computing', model: 'Dell Rugged 5430', status: 'in_use', assign: 'proj_solaris_kolhapur' },
    { name: 'Field Vehicle — Bolero Camper', type: 'vehicle', model: 'Mahindra Bolero Camper', status: 'active' },
    { name: 'Spare Propeller Set', type: 'accessory', model: 'M350 Propeller Set', status: 'active' },
    { name: 'Hard Transport Case', type: 'accessory', model: 'Pelican 1607 Air', status: 'maintenance' },
  ];
  for (const a of assets) {
    await q(
      `INSERT INTO assets (name, asset_type, model, status, purchase_date, purchase_price, current_value, assigned_project_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [a.name, a.type, a.model, a.status, daysFromToday(-400), 120000, 85000, a.assign ? ids[`project_${a.assign.replace('proj_', '')}`] || null : null, ids.user_admin]
    );
  }
  console.log(`✓ ${assets.length} assets created`);
}

// ═══════════════════════════════════════════════════════════════════════
// 6. BUSINESS DEVELOPMENT (lead-gen CRM — self-contained, own fictional
//    company names distinct from the "clients" table above)
// ═══════════════════════════════════════════════════════════════════════
async function seedBD(ids) {
  const leads = [
    { key: 'bd1', name: 'Aravali Solar Infra Pvt Ltd', sectors: ['solar'], priority: 'A', status: 'wip', city: 'Jodhpur', state: 'Rajasthan' },
    { key: 'bd2', name: 'Konkan Wind Energy Ltd', sectors: ['windmill'], priority: 'B', status: 'wip', city: 'Ratnagiri', state: 'Maharashtra' },
    { key: 'bd3', name: 'Deccan Transmission Corp', sectors: ['td_lines'], priority: 'A', status: 'to_be_initiated', city: 'Hyderabad', state: 'Telangana' },
    { key: 'bd4', name: 'Sahyadri Cement Works', sectors: ['chimney'], priority: 'C', status: 'to_be_initiated', city: 'Chandrapur', state: 'Maharashtra' },
    { key: 'bd5', name: 'Bharat Telecom Towers Ltd', sectors: ['tower'], priority: 'B', status: 'closed_onboard', city: 'Indore', state: 'Madhya Pradesh' },
    { key: 'bd6', name: 'Ganga Gas Pipelines Pvt Ltd', sectors: ['pipeline'], priority: 'A', status: 'wip', city: 'Kanpur', state: 'Uttar Pradesh' },
    { key: 'bd7', name: 'Coastal Quarry & Mining Co', sectors: ['volumetric'], priority: 'C', status: 'wip', city: 'Bellary', state: 'Karnataka' },
    { key: 'bd8', name: 'Vindhya Solar Parks Ltd', sectors: ['solar'], priority: 'B', status: 'to_be_initiated', city: 'Bhopal', state: 'Madhya Pradesh' },
    { key: 'bd9', name: 'Malwa Windfarms Pvt Ltd', sectors: ['windmill'], priority: 'C', status: 'closed_cancelled', city: 'Dewas', state: 'Madhya Pradesh' },
    { key: 'bd10', name: 'Orissa Steel Towers Ltd', sectors: ['tower', 'other'], priority: 'B', status: 'wip', city: 'Rourkela', state: 'Odisha' },
  ];

  const departments = ['procurement', 'projects', 'om', 'engineering', 'management'];
  let i = 0;
  for (const l of leads) {
    const id = uid();
    ids[`bd_${l.key}`] = id;
    await q(
      `INSERT INTO bd_clients (id, name, details, bd_owner_id, priority, sectors, status, status_changed_at, city, state, notes, next_follow_up_at, last_activity_at, contact_count, touchpoint_count, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,1,1,$4)`,
      [id, l.name, `Prospective client for ${l.sectors.join('/')} drone survey services.`, i % 2 === 0 ? ids.user_pm1 : ids.user_pm2,
       l.priority, l.sectors, l.status, daysFromToday(-(5 + i)), l.city, l.state,
       'Sourced via industry referral. Fictional demo lead.', daysFromToday(3 + i), daysFromToday(-(1 + i))]
    );

    const contactId = uid();
    await q(
      `INSERT INTO bd_contacts (id, client_id, name, designation, department, is_primary, is_decision_maker, created_by)
       VALUES ($1,$2,$3,$4,$5,true,true,$6)`,
      [contactId, id, `Contact Person ${i + 1}`, 'Head of Procurement', departments[i % departments.length], l.bd_owner_id || ids.user_pm1]
    );

    const channelId = uid();
    await q(
      `INSERT INTO bd_channels (id, client_id, owner_type, contact_id, channel_type, value, is_primary, channel_status, created_by)
       VALUES ($1,$2,'contact',$3,'email',$4,true,$5,$6)`,
      [channelId, id, contactId, `procurement${i + 1}@${l.name.toLowerCase().replace(/[^a-z]+/g, '')}-demo.example`,
       ['contacted', 'responded', 'awaiting_response'][i % 3], ids.user_pm1]
    );

    const touchpointId = uid();
    await q(
      `INSERT INTO bd_touchpoints (id, client_id, contact_id, channel_id, interaction_type, direction, occurred_at, subject, summary, response_status, created_by)
       VALUES ($1,$2,$3,$4,'email','outbound',$5,$6,$7,$8,$9)`,
      [touchpointId, id, contactId, channelId, daysFromToday(-(1 + i)),
       `Introduction — SkyArc Aerial Drone Survey Services`,
       `Sent capability deck and indicative pricing for ${l.sectors[0]} inspection services.`,
       ['awaiting', 'positive', 'neutral'][i % 3], ids.user_pm1]
    );

    if (['wip', 'to_be_initiated'].includes(l.status)) {
      await q(
        `INSERT INTO bd_followups (client_id, touchpoint_id, contact_id, channel_id, due_at, status, assigned_to, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, touchpointId, contactId, channelId, daysFromToday(2 + i),
         i % 3 === 0 ? 'pending' : 'sent', ids.user_pm1, 'Follow up on proposal feedback.', ids.user_pm1]
      );
    }
    i++;
  }
  console.log(`✓ ${leads.length} BD leads created with contacts/channels/touchpoints/followups`);
}

// ═══════════════════════════════════════════════════════════════════════
// 7. SALES PIPELINE (separate from BD — leads that reached quotation stage)
// ═══════════════════════════════════════════════════════════════════════
async function seedPipeline(ids) {
  const leads = [
    { key: 'p1', name: 'Rooftop Solar Survey — Nashik Industrial Estate', client: 'Solaris Green Energy Pvt Ltd', client_id: 'client_solaris', type: 'solar_pv', stage: 'inquiry', value: 420000, prob: 30, state: 'Maharashtra' },
    { key: 'p2', name: 'Wind Blade Inspection — Chalkewadi Phase 3', client: 'Windforce Renewables Ltd', client_id: 'client_windforce', type: 'wind', stage: 'inquiry', value: 610000, prob: 35, state: 'Maharashtra' },
    { key: 'p3', name: '132kV Line Corridor Mapping — Dhule', client: 'PowerGrid Bhoomi Transmission Co', client_id: 'client_powergrid', type: 'td_lines', stage: 'commercial_proposal', value: 980000, prob: 55, state: 'Maharashtra' },
    { key: 'p4', name: 'Telecom Tower Structural Audit — Pune Circle', client: 'TeleTower Infra Services', client_id: 'client_teletower', type: 'tower', stage: 'commercial_proposal', value: 350000, prob: 50, state: 'Maharashtra' },
    { key: 'p5', name: 'Cross-Country Pipeline ROW Encroachment Survey', client: 'NationalPipe Energy Corp', client_id: 'client_natpipe', type: 'pipeline', stage: 'pre_confirmation', value: 1450000, prob: 70, state: 'Gujarat' },
    { key: 'p6', name: 'Quarry Stockpile Volumetric Survey — Nagpur', client: 'Metro Infra Developers', client_id: 'client_metroinfra', type: 'volumetric', stage: 'onboarding', value: 275000, prob: 90, state: 'Maharashtra' },
    { key: 'p7', name: 'Ratlam Solar Farm — New Site Feasibility Survey', client: 'Solaris Green Energy Pvt Ltd', client_id: 'client_solaris', type: 'solar_pv', stage: 'converted', value: 890000, prob: 100, state: 'Madhya Pradesh' },
    { key: 'p8', name: 'Offshore Feasibility Mapping — Konkan Coast', client: 'Windforce Renewables Ltd', client_id: 'client_windforce', type: 'other', stage: 'cancelled', value: 500000, prob: 10, state: 'Maharashtra' },
  ];

  for (const [i, l] of leads.entries()) {
    const id = uid();
    ids[`pipeline_${l.key}`] = id;
    const salesExec = i % 2 === 0 ? 'Rohan Mehta' : 'Sneha Kulkarni';
    await q(
      `INSERT INTO pipeline
       (id, name, client_name, client_id, project_type, stage, estimated_value, win_probability, state,
        tentative_scope, notes, requirement, tentative_pilot, tentative_drone,
        estimated_start, estimated_end, created_by, contact_number, contact_email,
        enquiry_date, sales_executive, cancel_reason,
        onboarding_po_number, onboarding_wo_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
      [id, l.name, l.client, ids[l.client_id], l.type, l.stage, l.value, l.prob, l.state,
       `Aerial survey and reporting for ${l.name}.`, 'Fictional demo opportunity — awaiting client confirmation.',
       'Full-site coverage with orthomosaic and inspection report deliverables.',
       ids.pilot_pilot1, ids.drone_d1,
       daysFromToday(10 + i * 3), daysFromToday(25 + i * 3), ids.user_pm1,
       '+91 98765 4' + (1000 + i), `contact${i + 1}@${l.client_id.replace('client_', '')}-demo.example`,
       daysFromToday(-(20 + i * 4)), salesExec,
       l.stage === 'cancelled' ? 'Client postponed the initiative to next fiscal year.' : null,
       l.stage === 'onboarding' || l.stage === 'converted' ? `PO-2026-${100 + i}` : null,
       l.stage === 'onboarding' || l.stage === 'converted' ? `WO-2026-${100 + i}` : null]
    );
  }
  console.log(`✓ ${leads.length} pipeline leads created (all stages represented)`);

  // One pipeline document (real PDF) on the onboarding-stage lead, so the
  // Pipeline detail page's document tab has something real to open.
  const buf = await makePdf({
    title: 'Commercial Proposal — Quarry Volumetric Survey',
    lines: [
      'Client: Metro Infra Developers',
      'Scope: Monthly volumetric drone survey of the active quarry stockpile.',
      '',
      'Indicative Price: INR 2,75,000 (all-inclusive)',
      'Validity: 30 days from date of issue',
    ],
  });
  const f = await putBuffer('pipeline/metro-infra-quarry-proposal.pdf', buf, 'application/pdf');
  await q(
    `INSERT INTO pipeline_documents (pipeline_id, name, file_key, file_name, file_size, is_default, uploaded_by, uploaded_at)
     VALUES ($1,'Commercial Proposal.pdf',$2,'commercial-proposal.pdf',$3,true,$4,now())`,
    [ids.pipeline_p6, f.file_key, f.file_size, ids.user_pm2]
  );
  console.log('✓ 1 pipeline document uploaded (real file)');
}

// ═══════════════════════════════════════════════════════════════════════
// 8. PROJECTS (+ members, allocations, scope, maps)
// ═══════════════════════════════════════════════════════════════════════
async function insertProject(ids, key, p) {
  const id = uid();
  ids[`project_${key}`] = id;
  await q(
    `INSERT INTO projects
     (id, name, client_name, client_id, project_type, status, start_date, end_date, state, district,
      location_name, latitude, longitude, po_number, work_order_number, contact_person, contact_number,
      contact_email, needs_attention, created_by, drone_flying_zone, project_value, cancel_reason, source_pipeline_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
    [id, p.name, p.client_name, p.client_id, p.type, p.status, p.start || null, p.end || null, p.state, p.district || null,
     p.location_name || null, p.lat || null, p.lng || null, p.po || null, p.wo || null, p.contact_person || null,
     p.contact_number || null, p.contact_email || null, !!p.needs_attention, p.created_by, p.zone || 'Green Zone — DGCA Approved',
     p.value || null, p.cancel_reason || null, p.source_pipeline_id || null]
  );
  return id;
}

async function seedProjects(ids) {
  const P = ids; // shorthand

  await insertProject(ids, 'solaris_kolhapur', {
    name: 'Solaris Kolhapur 50MW O&M Thermal Inspection', client_name: 'Solaris Green Energy Pvt Ltd', client_id: P.client_solaris,
    type: 'solar_pv', status: 'on_going', start: daysFromToday(-20), end: daysFromToday(10), state: 'Maharashtra', district: 'Kolhapur',
    location_name: 'Kolhapur Solar Park', lat: 16.7050, lng: 74.2433, po: 'PO-2026-201', wo: 'WO-2026-201',
    contact_person: 'Nikhil Bansal', contact_number: '+91 98765 40001', contact_email: 'nikhil.bansal@solarisgreen-demo.example',
    created_by: P.user_pm1, value: 1850000,
  });
  await insertProject(ids, 'windforce_satara', {
    name: 'Windforce Satara Turbine Blade Survey', client_name: 'Windforce Renewables Ltd', client_id: P.client_windforce,
    type: 'wind', status: 'planned', start: daysFromToday(15), end: daysFromToday(25), state: 'Maharashtra', district: 'Satara',
    location_name: 'Chalkewadi Wind Farm', lat: 17.6805, lng: 73.9200, po: 'PO-2026-202', wo: 'WO-2026-202',
    contact_person: 'Kavya Reddy', contact_number: '+91 98765 40002', contact_email: 'kavya.reddy@windforce-demo.example',
    created_by: P.user_pm2, value: 610000,
  });
  await insertProject(ids, 'powergrid_corridor', {
    name: 'PowerGrid 220kV Corridor Patrol — Phase 2', client_name: 'PowerGrid Bhoomi Transmission Co', client_id: P.client_powergrid,
    type: 'td_lines', status: 'executed', start: daysFromToday(-40), end: daysFromToday(-20), state: 'Maharashtra', district: 'Nashik',
    location_name: 'Nashik–Dhule 220kV Corridor', lat: 19.9975, lng: 73.7898, po: 'PO-2026-203', wo: 'WO-2026-203',
    contact_person: 'Suresh Pillai', contact_number: '+91 98765 40003', contact_email: 'suresh.pillai@pgbhoomi-demo.example',
    created_by: P.user_pm1, value: 980000,
  });
  await insertProject(ids, 'teletower_mumbai', {
    name: 'TeleTower Mumbai Rooftop Structural Audit', client_name: 'TeleTower Infra Services', client_id: P.client_teletower,
    type: 'tower', status: 'initiate', start: daysFromToday(30), end: daysFromToday(35), state: 'Maharashtra', district: 'Mumbai',
    location_name: 'Mumbai Metro Circle', lat: 19.0760, lng: 72.8777, po: null, wo: null,
    contact_person: 'Rina D’Souza', contact_number: '+91 98765 40004', contact_email: 'rina.dsouza@teletower-demo.example',
    created_by: P.user_pm2, value: 350000, needs_attention: true,
  });
  await insertProject(ids, 'natpipe_crosscountry', {
    name: 'NationalPipe Cross-Country Pipeline ROW Survey', client_name: 'NationalPipe Energy Corp', client_id: P.client_natpipe,
    type: 'pipeline', status: 'post_processing', start: daysFromToday(-25), end: daysFromToday(-5), state: 'Gujarat', district: 'Vadodara',
    location_name: 'Vadodara–Bharuch Pipeline ROW', lat: 22.3072, lng: 73.1812, po: 'PO-2026-205', wo: 'WO-2026-205',
    contact_person: 'Manoj Trivedi', contact_number: '+91 98765 40005', contact_email: 'manoj.trivedi@natpipe-demo.example',
    created_by: P.user_pm1, value: 1450000,
  });
  await insertProject(ids, 'metroinfra_nagpur', {
    name: 'Metro Infra Nagpur Earthwork Volumetric Study', client_name: 'Metro Infra Developers', client_id: P.client_metroinfra,
    type: 'volumetric', status: 'complete', start: daysFromToday(-90), end: daysFromToday(-60), state: 'Maharashtra', district: 'Nagpur',
    location_name: 'Nagpur Quarry Site', lat: 21.1458, lng: 79.0882, po: 'PO-2026-206', wo: 'WO-2026-206',
    contact_person: 'Alok Bhatt', contact_number: '+91 98765 40006', contact_email: 'alok.bhatt@metroinfra-demo.example',
    created_by: P.user_pm2, value: 275000,
  });
  await insertProject(ids, 'solaris_bhadla', {
    name: 'Solaris Bhadla Solar Park Thermal Inspection', client_name: 'Solaris Green Energy Pvt Ltd', client_id: P.client_solaris,
    type: 'solar_pv', status: 'complete', start: daysFromToday(-150), end: daysFromToday(-120), state: 'Rajasthan', district: 'Jodhpur',
    location_name: 'Bhadla Solar Park', lat: 27.5350, lng: 71.9160, po: 'PO-2025-991', wo: 'WO-2025-991',
    contact_person: 'Nikhil Bansal', contact_number: '+91 98765 40001', contact_email: 'nikhil.bansal@solarisgreen-demo.example',
    created_by: P.user_pm1, value: 4200000,
  });
  await insertProject(ids, 'windforce_coastal', {
    name: 'Windforce Coastal Feasibility Mapping', client_name: 'Windforce Renewables Ltd', client_id: P.client_windforce,
    type: 'other', status: 'cancelled', start: null, end: null, state: 'Maharashtra', district: 'Ratnagiri',
    location_name: 'Konkan Coast', lat: 17.0000, lng: 73.3000, po: null, wo: null,
    contact_person: 'Kavya Reddy', contact_number: '+91 98765 40002', contact_email: 'kavya.reddy@windforce-demo.example',
    created_by: P.user_pm2, value: 500000, cancel_reason: 'Client shelved the offshore feasibility study pending regulatory clarity.',
  });

  // ── Project converted directly from a pipeline lead (mirrors conversion.service.js exactly) ──
  const src = (await q('SELECT * FROM pipeline WHERE id = $1', [P.pipeline_p7])).rows[0];
  const ratlamId = await insertProject(ids, 'ratlam_new_site', {
    name: src.name, client_name: src.client_name, client_id: src.client_id, type: src.project_type, status: 'initiate',
    start: src.estimated_start, end: src.estimated_end, state: src.state, lat: src.latitude, lng: src.longitude,
    po: src.onboarding_po_number, wo: src.onboarding_wo_number, contact_number: src.contact_number, contact_email: src.contact_email,
    created_by: P.user_pm1, value: src.estimated_value, needs_attention: true, source_pipeline_id: P.pipeline_p7,
  });
  await q('UPDATE pipeline SET converted_project_id = $1 WHERE id = $2', [ratlamId, P.pipeline_p7]);
  console.log('✓ 9 projects created (one via realistic pipeline→project conversion)');

  // ── Members + allocations ──
  const memberships = [
    ['solaris_kolhapur', P.user_pm1, 'project_manager'], ['solaris_kolhapur', P.user_pilot1, 'pilot'], ['solaris_kolhapur', P.user_pilot3, 'pilot'],
    ['windforce_satara', P.user_pm2, 'project_manager'], ['windforce_satara', P.user_pilot2, 'pilot'],
    ['powergrid_corridor', P.user_pm1, 'project_manager'], ['powergrid_corridor', P.user_pilot4, 'pilot'],
    ['teletower_mumbai', P.user_pm2, 'project_manager'],
    ['natpipe_crosscountry', P.user_pm1, 'project_manager'], ['natpipe_crosscountry', P.user_pilot5, 'pilot'],
    ['metroinfra_nagpur', P.user_pm2, 'project_manager'], ['metroinfra_nagpur', P.user_pilot3, 'pilot'],
    ['solaris_bhadla', P.user_pm1, 'project_manager'], ['solaris_bhadla', P.user_pilot1, 'pilot'],
    ['windforce_coastal', P.user_pm2, 'project_manager'],
    ['ratlam_new_site', P.user_pm1, 'project_manager'],
  ];
  for (const [projKey, userId, role] of memberships) {
    await q(`INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [ids[`project_${projKey}`], userId, role]);
  }

  const allocations = [
    ['solaris_kolhapur', 'pilot_pilot1', 'drone_d1', -18, 8, 'pilot_copilot1'],
    ['solaris_kolhapur', 'pilot_pilot3', 'drone_d2', -5, 8, null],
    ['windforce_satara', 'pilot_pilot2', 'drone_d3', 15, 22, null],
    ['powergrid_corridor', 'pilot_pilot4', 'drone_d1', -38, -22, null],
    ['natpipe_crosscountry', 'pilot_pilot5', 'drone_d4', -24, -6, 'pilot_copilot2'],
    ['metroinfra_nagpur', 'pilot_pilot3', 'drone_d3', -88, -62, null],
    ['solaris_bhadla', 'pilot_pilot1', 'drone_d1', -148, -122, null],
  ];
  for (const [projKey, pilotKey, droneKey, startOff, endOff, copilotKey] of allocations) {
    await q(
      `INSERT INTO allocations (project_id, pilot_id, drone_id, start_date, end_date, is_primary, copilot_id)
       VALUES ($1,$2,$3,$4,$5,true,$6)`,
      [ids[`project_${projKey}`], ids[pilotKey], ids[droneKey], daysFromToday(startOff), daysFromToday(endOff), copilotKey ? ids[copilotKey] : null]
    );
  }
  console.log(`✓ ${memberships.length} project memberships, ${allocations.length} allocations created`);

  // ── Scope ──
  const scopes = [
    ['solaris_kolhapur', { area_hectares: 120, deliverables_expected: { items: ['Orthomosaic', 'Thermal Report', 'Inspection Report PDF', 'Raw Images'] }, special_instructions: 'Panel-level thermal anomaly detection required; flag hotspots >20°C delta.' }],
    ['windforce_satara', { asset_count: 18, deliverables_expected: { items: ['Inspection Report PDF', 'Raw Images', 'Processed Video'] }, special_instructions: 'Blade leading-edge erosion focus; 18 WTGs across the farm.' }],
    ['powergrid_corridor', { length_km: 85, deliverables_expected: { items: ['Inspection Report PDF', 'Orthomosaic', 'Raw Images'] }, special_instructions: 'Tower-by-tower conductor and insulator inspection along the 220kV corridor.' }],
    ['teletower_mumbai', { asset_count: 12, deliverables_expected: { items: ['Inspection Report PDF', 'Raw Images', '3D Model'] }, special_instructions: 'Rooftop structural and antenna-alignment audit across 12 sites.' }],
    ['natpipe_crosscountry', { length_km: 210, deliverables_expected: { items: ['Orthomosaic', 'Inspection Report PDF', 'Raw Images'] }, special_instructions: 'Right-of-way encroachment and leak-indicator vegetation stress survey.' }],
    ['metroinfra_nagpur', { area_hectares: 40, deliverables_expected: { items: ['Volume Report', 'Point Cloud', 'Orthomosaic'] }, special_instructions: 'Monthly stockpile volumetric comparison against previous survey.' }],
    ['solaris_bhadla', { area_hectares: 500, deliverables_expected: { items: ['Orthomosaic', 'Thermal Report', 'Inspection Report PDF'] }, special_instructions: 'Full-park thermal sweep across all inverter blocks.' }],
  ];
  for (const [projKey, s] of scopes) {
    await q(
      `INSERT INTO project_scope (project_id, area_hectares, length_km, asset_count, deliverables_expected, special_instructions)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (project_id) DO NOTHING`,
      [ids[`project_${projKey}`], s.area_hectares || null, s.length_km || null, s.asset_count || null,
       JSON.stringify(s.deliverables_expected), s.special_instructions]
    );
  }
  console.log(`✓ ${scopes.length} project scope records created`);

  // ── Maps (real KML uploaded to R2 + matching geojson/bbox/area) ──
  // Kolhapur solar park — a ~110 ha rectangular site boundary.
  const kolhapurRing = [
    [74.23814, 16.70949], [74.24846, 16.70949], [74.24846, 16.70051], [74.23814, 16.70051], [74.23814, 16.70949],
  ];
  const kolhapurKml = await putBuffer('maps/solaris-kolhapur-site-boundary.kml',
    makeKml({ name: 'Solaris Kolhapur Site Boundary', coordinates: kolhapurRing, kind: 'Polygon' }), 'application/vnd.google-earth.kml+xml');
  await q(
    `INSERT INTO project_maps (project_id, geojson_data, center_lat, center_lng, zoom_level, kml_key, bbox, area_sqm)
     VALUES ($1,$2,16.7050,74.2433,15,$3,$4,1100000)`,
    [ids.project_solaris_kolhapur,
     JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Site Boundary' }, geometry: { type: 'Polygon', coordinates: [kolhapurRing] } }] }),
     kolhapurKml.file_key,
     JSON.stringify({ minLng: 74.23814, minLat: 16.70051, maxLng: 74.24846, maxLat: 16.70949 })]
  );
  await q(
    `INSERT INTO project_kml_uploads (project_id, name, kml_key, geojson_data, center_lat, center_lng, bbox, area_sqm, feature_count, uploaded_by)
     VALUES ($1,'Site Boundary.kml',$2,$3,16.7050,74.2433,$4,1100000,1,$5)`,
    [ids.project_solaris_kolhapur, kolhapurKml.file_key,
     JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [kolhapurRing] } }] }),
     JSON.stringify({ minLng: 74.23814, minLat: 16.70051, maxLng: 74.24846, maxLat: 16.70949 }), ids.user_pm1]
  );

  // PowerGrid corridor — a multi-point transmission-line route.
  const corridorLine = [[73.7898, 19.9975], [73.8300, 19.9400], [73.8700, 19.8700], [73.9000, 19.8000], [73.9300, 19.7300]];
  const corridorKml = await putBuffer('maps/powergrid-corridor-route.kml',
    makeKml({ name: 'PowerGrid 220kV Corridor Route', coordinates: corridorLine, kind: 'LineString' }), 'application/vnd.google-earth.kml+xml');
  await q(
    `INSERT INTO project_maps (project_id, geojson_data, center_lat, center_lng, zoom_level, kml_key, bbox)
     VALUES ($1,$2,19.87,73.86,11,$3,$4)`,
    [ids.project_powergrid_corridor,
     JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Corridor Route' }, geometry: { type: 'LineString', coordinates: corridorLine } }] }),
     corridorKml.file_key,
     JSON.stringify({ minLng: 73.7898, minLat: 19.7300, maxLng: 73.9300, maxLat: 19.9975 })]
  );
  console.log('✓ 2 project maps with real KML files uploaded');
}

// ═══════════════════════════════════════════════════════════════════════
// 9. ESTIMATIONS (uses the real Cost Engine so numbers foot correctly)
// ═══════════════════════════════════════════════════════════════════════
async function addEstimation(ids, { name, projectKey, pipelineKey, client_name, project_type, inputs, createdBy }) {
  const cost = costEngine.calculate(inputs);
  const details = { inputs, breakdown: cost };
  await q(
    `INSERT INTO estimations (project_id, pipeline_id, client_name, project_type, total_cost, margin, tax, details, created_by, name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [projectKey ? ids[`project_${projectKey}`] : null, pipelineKey ? ids[`pipeline_${pipelineKey}`] : null,
     client_name, project_type, cost.total, cost.margin, cost.tax, JSON.stringify(details), createdBy, name]
  );
  return cost.total;
}

async function seedEstimations(ids) {
  const base = { overhead_percent: 15, contingency_percent: 5, margin_percent: 18, tax_percent: 18, report_writing_rate: 600, storage_cost: 1200 };
  const deliverableSet = (...keys) => {
    const rates = { orthomosaic: 3000, thermal_report: 2500, inspection_report_pdf: 3500, raw_images: 500, point_cloud: 4500, volume_report: 4000, three_d_model: 5500, processed_video: 2000, kml_output: 800 };
    const label = { orthomosaic: 'Orthomosaic', thermal_report: 'Thermal Report', inspection_report_pdf: 'Inspection Report PDF', raw_images: 'Raw Images', point_cloud: 'Point Cloud', volume_report: 'Volume Report', three_d_model: '3D Model', processed_video: 'Processed Video', kml_output: 'KML Output' };
    return keys.map((k) => ({ key: k, label: label[k], quantity: 1, unit_cost: rates[k] }));
  };

  let n = 0;
  n += await addEstimation(ids, {
    name: 'Solaris Kolhapur — O&M Thermal Inspection Costing', projectKey: 'solaris_kolhapur', client_name: 'Solaris Green Energy Pvt Ltd', project_type: 'solar_pv', createdBy: ids.user_pm1,
    inputs: { ...base, days: 10, pilot_rate: 4500, drone_rate: 8000, copilot_rate: 2500, pilots_count: 2, drones_count: 1, copilot_count: 1,
      travel_mode: 'road', travel_rate: 18, distance_km: 250, mobilizations: 1, team_size: 3,
      accommodation_nights: 9, accommodation_rate: 3000, daily_travel_days: 10, daily_travel_rate: 800, per_diem_rate: 500, on_site_days: 10,
      deliverable_items: deliverableSet('orthomosaic', 'thermal_report', 'inspection_report_pdf', 'raw_images'),
      report_writing_hours: 16, scope_quantity: 50 },
  });
  n += await addEstimation(ids, {
    name: 'Windforce Satara — Turbine Blade Survey Costing', projectKey: 'windforce_satara', client_name: 'Windforce Renewables Ltd', project_type: 'wind', createdBy: ids.user_pm2,
    inputs: { ...base, days: 6, pilot_rate: 4200, drone_rate: 3500, pilots_count: 1, drones_count: 1,
      travel_mode: 'road', travel_rate: 18, distance_km: 140, mobilizations: 1, team_size: 2,
      accommodation_nights: 5, accommodation_rate: 3000, daily_travel_days: 6, daily_travel_rate: 700, per_diem_rate: 500, on_site_days: 6,
      deliverable_items: deliverableSet('inspection_report_pdf', 'raw_images', 'processed_video'),
      report_writing_hours: 10, scope_quantity: 18 },
  });
  n += await addEstimation(ids, {
    name: 'PowerGrid 220kV Corridor — Patrol Costing (Phase 2)', projectKey: 'powergrid_corridor', client_name: 'PowerGrid Bhoomi Transmission Co', project_type: 'td_lines', createdBy: ids.user_pm1,
    inputs: { ...base, days: 12, pilot_rate: 4100, drone_rate: 8000, pilots_count: 1, drones_count: 1,
      travel_mode: 'road', travel_rate: 18, distance_km: 90, mobilizations: 2, team_size: 2,
      accommodation_nights: 11, accommodation_rate: 2000, daily_travel_days: 12, daily_travel_rate: 900, per_diem_rate: 500, on_site_days: 12,
      deliverable_items: deliverableSet('inspection_report_pdf', 'orthomosaic', 'raw_images'),
      report_writing_hours: 20, scope_quantity: 85 },
  });
  n += await addEstimation(ids, {
    name: 'TeleTower Mumbai — Preliminary Audit Costing', projectKey: 'teletower_mumbai', client_name: 'TeleTower Infra Services', project_type: 'tower', createdBy: ids.user_pm2,
    inputs: { ...base, days: 4, pilot_rate: 4000, drone_rate: 3500, pilots_count: 1, drones_count: 1,
      travel_mode: 'road', travel_rate: 18, distance_km: 25, mobilizations: 1, team_size: 1,
      daily_travel_days: 4, daily_travel_rate: 600, per_diem_rate: 400, on_site_days: 4,
      deliverable_items: deliverableSet('inspection_report_pdf', 'raw_images', 'three_d_model'),
      report_writing_hours: 8, scope_quantity: 12 },
  });
  n += await addEstimation(ids, {
    name: 'NationalPipe ROW Survey — Draft Quotation', pipelineKey: 'p5', client_name: 'NationalPipe Energy Corp', project_type: 'pipeline', createdBy: ids.user_pm1,
    inputs: { ...base, days: 18, pilot_rate: 4300, drone_rate: 9000, pilots_count: 2, drones_count: 1, copilot_rate: 2500, copilot_count: 1,
      travel_mode: 'road', travel_rate: 18, distance_km: 320, mobilizations: 1, team_size: 3,
      accommodation_nights: 16, accommodation_rate: 3000, daily_travel_days: 18, daily_travel_rate: 1000, per_diem_rate: 500, on_site_days: 18,
      deliverable_items: deliverableSet('orthomosaic', 'inspection_report_pdf', 'raw_images'),
      report_writing_hours: 24, scope_quantity: 210 },
  });
  n += await addEstimation(ids, {
    name: 'Metro Infra Quarry — Monthly Volumetric Quotation', pipelineKey: 'p6', client_name: 'Metro Infra Developers', project_type: 'volumetric', createdBy: ids.user_pm2,
    inputs: { ...base, days: 3, pilot_rate: 4000, drone_rate: 3500, pilots_count: 1, drones_count: 1,
      travel_mode: 'road', travel_rate: 18, distance_km: 15, mobilizations: 1, team_size: 1,
      daily_travel_days: 3, daily_travel_rate: 500, per_diem_rate: 400, on_site_days: 3,
      deliverable_items: deliverableSet('volume_report', 'point_cloud', 'orthomosaic'),
      report_writing_hours: 6, scope_quantity: 40 },
  });
  n += await addEstimation(ids, {
    name: 'Metro Infra Nagpur — Final Project Costing', projectKey: 'metroinfra_nagpur', client_name: 'Metro Infra Developers', project_type: 'volumetric', createdBy: ids.user_pm2,
    inputs: { ...base, days: 3, pilot_rate: 4000, drone_rate: 3500, pilots_count: 1, drones_count: 1,
      travel_mode: 'road', travel_rate: 18, distance_km: 15, mobilizations: 1, team_size: 1,
      daily_travel_days: 3, daily_travel_rate: 500, per_diem_rate: 400, on_site_days: 3,
      deliverable_items: deliverableSet('volume_report', 'point_cloud', 'orthomosaic'),
      report_writing_hours: 6, scope_quantity: 40 },
  });
  n += await addEstimation(ids, {
    name: 'Solaris Bhadla — Full Park Thermal Sweep Costing', projectKey: 'solaris_bhadla', client_name: 'Solaris Green Energy Pvt Ltd', project_type: 'solar_pv', createdBy: ids.user_pm1,
    inputs: { ...base, days: 20, pilot_rate: 4500, drone_rate: 8000, copilot_rate: 2500, pilots_count: 2, drones_count: 2, copilot_count: 1,
      travel_mode: 'road', travel_rate: 18, distance_km: 620, mobilizations: 1, team_size: 3,
      accommodation_nights: 18, accommodation_rate: 2000, daily_travel_days: 20, daily_travel_rate: 900, per_diem_rate: 500, on_site_days: 20,
      deliverable_items: deliverableSet('orthomosaic', 'thermal_report', 'inspection_report_pdf'),
      report_writing_hours: 30, scope_quantity: 500 },
  });
  n += await addEstimation(ids, {
    name: 'Windforce Chalkewadi Phase 3 — Commercial Proposal', pipelineKey: 'p2', client_name: 'Windforce Renewables Ltd', project_type: 'wind', createdBy: ids.user_pm2,
    inputs: { ...base, days: 8, pilot_rate: 4200, drone_rate: 3500, pilots_count: 1, drones_count: 1,
      travel_mode: 'road', travel_rate: 18, distance_km: 160, mobilizations: 1, team_size: 2,
      accommodation_nights: 7, accommodation_rate: 3000, daily_travel_days: 8, daily_travel_rate: 700, per_diem_rate: 500, on_site_days: 8,
      deliverable_items: deliverableSet('inspection_report_pdf', 'raw_images', 'processed_video'),
      report_writing_hours: 12, scope_quantity: 24 },
  });
  n += await addEstimation(ids, {
    name: 'Generic Solar O&M Package — Rate Card Reference', client_name: 'SkyArc Internal', project_type: 'solar_pv', createdBy: ids.user_admin,
    inputs: { ...base, days: 5, pilot_rate: 4500, drone_rate: 8000, pilots_count: 1, drones_count: 1,
      daily_travel_days: 5, daily_travel_rate: 800, per_diem_rate: 500, on_site_days: 5,
      deliverable_items: deliverableSet('orthomosaic', 'thermal_report'), report_writing_hours: 10, scope_quantity: 20 },
  });
  console.log(`✓ 10 estimations created via the real cost engine (total value ₹${Math.round(n).toLocaleString('en-IN')})`);
}

// ═══════════════════════════════════════════════════════════════════════
// 10. DELIVERABLES & PROJECT DOCUMENTS (a curated subset backed by real
//     R2 files so preview/download works live during the demo; the rest
//     are realistic metadata-only rows for screens that just need to look
//     populated).
// ═══════════════════════════════════════════════════════════════════════
async function addDeliverable(ids, projectKey, { name, format, status = 'approved', file, parent_id = null, is_folder = false, uploadedBy, reviewedBy = null, rejected_reason = null, uploadedOffset = -2 }) {
  const projectId = ids[`project_${projectKey}`];
  const uploaded_at = file || is_folder ? `CURRENT_TIMESTAMP + interval '${uploadedOffset} days'` : null;
  const approved_at = file ? `CURRENT_TIMESTAMP + interval '${uploadedOffset} days'` : null;
  const result = await q(
    `INSERT INTO deliverables (project_id, name, format, file_key, file_size, uploaded_by, status, parent_id, is_folder, uploaded_at, approved_at, rejected_reason, rejected_by, rejected_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
       ${uploaded_at ? uploaded_at : 'NULL'}, ${approved_at ? approved_at : 'NULL'},
       $10, $11, ${status === 'rejected' ? 'CURRENT_TIMESTAMP' : 'NULL'})
     RETURNING id`,
    [projectId, name, format || null, file ? file.file_key : null, file ? file.file_size : null, uploadedBy, status, parent_id, is_folder, rejected_reason,
     status === 'rejected' ? (reviewedBy || uploadedBy) : null]
  );
  return result.rows[0].id;
}

async function seedDeliverablesAndDocs(ids) {
  // ── Flagship project: Solaris Kolhapur — full mix of states, real files ──
  const orthoV1 = await putBuffer('deliverables/kolhapur-orthomosaic-v1.pdf',
    await makePdf({ title: 'Orthomosaic Report — Block A (v1)', lines: ['Project: Solaris Kolhapur 50MW O&M', 'Coverage: Block A (28 ha)', 'GSD: 2.1 cm/px', '', 'Draft version — pending client sign-off.'] }), 'application/pdf');
  const orthoId = await addDeliverable(ids, 'solaris_kolhapur', { name: 'Orthomosaic_Block_A.pdf', format: 'pdf', status: 'approved', file: orthoV1, uploadedBy: ids.user_pilot1, uploadedOffset: -12 });
  ids.deliverable_ortho = orthoId;
  await q(`INSERT INTO deliverable_versions (deliverable_id, file_key, file_name, file_size, version, uploaded_by, notes) VALUES ($1,$2,'kolhapur-orthomosaic-v1.pdf',$3,'v1',$4,'Initial delivery')`,
    [orthoId, orthoV1.file_key, orthoV1.file_size, ids.user_pilot1]);
  const orthoV2 = await putBuffer('deliverables/kolhapur-orthomosaic-v2.pdf',
    await makePdf({ title: 'Orthomosaic Report — Block A (v2, Final)', lines: ['Project: Solaris Kolhapur 50MW O&M', 'Coverage: Block A (28 ha)', 'GSD: 2.1 cm/px', '', 'Revised per client comments — panel row labels added.'] }), 'application/pdf');
  await q(`UPDATE deliverables SET file_key=$1, file_size=$2 WHERE id=$3`, [orthoV2.file_key, orthoV2.file_size, orthoId]);
  await q(`INSERT INTO deliverable_versions (deliverable_id, file_key, file_name, file_size, version, uploaded_by, notes) VALUES ($1,$2,'kolhapur-orthomosaic-v2.pdf',$3,'v2',$4,'Revised: added panel row labels per client feedback')`,
    [orthoId, orthoV2.file_key, orthoV2.file_size, ids.user_pilot1]);

  const thermal = await putBuffer('deliverables/kolhapur-thermal-report.pdf',
    await makePdf({ title: 'Thermal Anomaly Report', lines: ['Project: Solaris Kolhapur 50MW O&M', 'Anomalies detected: 14 hotspots >20°C delta', 'Recommended action: module-level inspection for 6 critical hotspots.'] }), 'application/pdf');
  await addDeliverable(ids, 'solaris_kolhapur', { name: 'Thermal_Anomaly_Report.pdf', format: 'pdf', status: 'approved', file: thermal, uploadedBy: ids.user_pilot1, uploadedOffset: -10 });

  const draft = await putBuffer('deliverables/kolhapur-inspection-draft.pdf',
    await makePdf({ title: 'Inspection Report — Draft', lines: ['Project: Solaris Kolhapur 50MW O&M', 'Draft inspection summary — GPS coordinates pending.'] }), 'application/pdf');
  ids.deliverable_rejected = await addDeliverable(ids, 'solaris_kolhapur', { name: 'Inspection_Report_Draft.pdf', format: 'pdf', status: 'rejected', file: draft, uploadedBy: ids.user_pilot3, reviewedBy: ids.user_pm1, uploadedOffset: -6, rejected_reason: 'Please include panel-level GPS coordinates in the anomaly table before resubmitting.' });

  await addDeliverable(ids, 'solaris_kolhapur', { name: 'Raw_Images_Batch2.zip', format: 'zip', status: 'pending', uploadedBy: ids.user_pilot3 });

  const folderId = await addDeliverable(ids, 'solaris_kolhapur', { name: 'Site Photos', is_folder: true, status: 'uploaded', uploadedBy: ids.user_pilot1, uploadedOffset: -11 });
  const photo1 = await putBuffer('deliverables/kolhapur-panel-row-12.png', makePng({ title: 'Panel Row 12', subtitle: 'Solaris Kolhapur — Block A', seedColor: '#1d4ed8' }), 'image/png');
  await addDeliverable(ids, 'solaris_kolhapur', { name: 'Panel_Row_12_Photo.png', format: 'png', status: 'approved', file: photo1, parent_id: folderId, uploadedBy: ids.user_pilot1, uploadedOffset: -11 });
  const photo2 = await putBuffer('deliverables/kolhapur-inverter-block-3.png', makePng({ title: 'Inverter Block 3', subtitle: 'Solaris Kolhapur — Block A', seedColor: '#b45309' }), 'image/png');
  await addDeliverable(ids, 'solaris_kolhapur', { name: 'Inverter_Block_3_Photo.png', format: 'png', status: 'approved', file: photo2, parent_id: folderId, uploadedBy: ids.user_pilot1, uploadedOffset: -11 });

  // ── Other projects — realistic metadata-only deliverables (no real file, not clicked during demo) ──
  const metaOnly = [
    ['powergrid_corridor', 'Corridor_Inspection_Report.pdf', 'pdf', ids.user_pilot4, -18],
    ['powergrid_corridor', 'Orthomosaic_Corridor.tif', 'tif', ids.user_pilot4, -18],
    ['natpipe_crosscountry', 'ROW_Orthomosaic.tif', 'tif', ids.user_pilot5, -8],
    ['natpipe_crosscountry', 'Encroachment_Report.pdf', 'pdf', ids.user_pilot5, -7],
    ['metroinfra_nagpur', 'Volume_Report_Aug2026.pdf', 'pdf', ids.user_pilot3, -62],
    ['metroinfra_nagpur', 'PointCloud_Export.las', 'las', ids.user_pilot3, -62],
    ['solaris_bhadla', 'Bhadla_Thermal_Report.pdf', 'pdf', ids.user_pilot1, -122],
    ['solaris_bhadla', 'Bhadla_Orthomosaic.tif', 'tif', ids.user_pilot1, -122],
  ];
  for (const [projKey, name, format, uploadedBy, off] of metaOnly) {
    await q(
      `INSERT INTO deliverables (project_id, name, format, uploaded_by, status, is_folder, uploaded_at, approved_at, file_size)
       VALUES ($1,$2,$3,$4,'approved',false, CURRENT_TIMESTAMP + interval '${off} days', CURRENT_TIMESTAMP + interval '${off} days', $5)`,
      [ids[`project_${projKey}`], name, format, uploadedBy, Math.round(2_000_000 + Math.random() * 30_000_000)]
    );
  }
  console.log('✓ Deliverables created (6 real files + versions + folder on flagship project, 8 metadata-only on others)');

  // ── Project documents ──
  const accessPermit = await putBuffer('documents/kolhapur-site-access-permission.pdf',
    await makePdf({ title: 'Site Access Permission', lines: ['Project: Solaris Kolhapur 50MW O&M', 'Granted to: SkyArc Aerial Solutions Pvt. Ltd.', 'Valid for the duration of the survey engagement.'] }), 'application/pdf');
  await q(
    `INSERT INTO project_documents (project_id, category, file_name, file_key, version, uploaded_by, file_size, file_type, description)
     VALUES ($1,'permission','Site_Access_Permission.pdf',$2,'v1',$3,$4,'pdf','Client-issued site access permission letter')`,
    [ids.project_solaris_kolhapur, accessPermit.file_key, ids.user_pm1, accessPermit.file_size]
  );
  const docsMeta = [
    ['solaris_kolhapur', 'scope_of_work', 'Scope_of_Work.pdf', ids.user_pm1],
    ['powergrid_corridor', 'contract', 'Work_Order_Copy.pdf', ids.user_pm1],
    ['natpipe_crosscountry', 'permission', 'NOC_Pipeline_Authority.pdf', ids.user_pm1],
    ['metroinfra_nagpur', 'contract', 'Completion_Certificate.pdf', ids.user_pm2],
    ['solaris_bhadla', 'site_survey_report', 'Site_Survey_Report.pdf', ids.user_pm1],
  ];
  for (const [projKey, category, fileName, uploadedBy] of docsMeta) {
    await q(
      `INSERT INTO project_documents (project_id, category, file_name, version, uploaded_by, file_type)
       VALUES ($1,$2,$3,'v1',$4,'pdf')`,
      [ids[`project_${projKey}`], category, fileName, uploadedBy]
    );
  }
  console.log('✓ 6 project documents created (1 real file + 5 metadata-only)');
}

// ═══════════════════════════════════════════════════════════════════════
// 11. EXPENSES & INVOICES
// ═══════════════════════════════════════════════════════════════════════
async function seedExpensesAndInvoices(ids) {
  const expenses = [
    ['solaris_kolhapur', ids.user_pilot1, 'fuel', 'cash', null, 'Diesel for site generator', -14, 2400],
    ['solaris_kolhapur', ids.user_pilot1, 'accommodation', 'bank_transfer', 'HDFC Bank', 'Hotel stay — 3 crew, 9 nights', -11, 27000],
    ['solaris_kolhapur', ids.user_pilot3, 'food', 'cash', null, 'Crew meals on site', -9, 3200],
    ['solaris_kolhapur', ids.user_pm1, 'equipment', 'upi', null, 'Replacement propeller set', -8, 4500],
    ['solaris_kolhapur', ids.user_pilot1, 'travel', 'bank_transfer', 'HDFC Bank', 'Cab hire — site to hotel', -7, 1800],
    ['powergrid_corridor', ids.user_pilot4, 'fuel', 'cash', null, 'Vehicle fuel — corridor patrol', -35, 5200],
    ['powergrid_corridor', ids.user_pilot4, 'accommodation', 'bank_transfer', 'ICICI Bank', 'Lodging — corridor survey team', -32, 18000],
    ['powergrid_corridor', ids.user_pm1, 'labour', 'cash', null, 'Local ground-crew assistance', -28, 6000],
    ['natpipe_crosscountry', ids.user_pilot5, 'accommodation', 'bank_transfer', 'SBI', 'Lodging — pipeline survey crew', -22, 24000],
    ['natpipe_crosscountry', ids.user_pilot5, 'fuel', 'cash', null, 'Field vehicle fuel', -18, 6100],
    ['natpipe_crosscountry', ids.user_pm1, 'general', 'cash', null, 'Miscellaneous site supplies', -15, 1500],
    ['metroinfra_nagpur', ids.user_pilot3, 'fuel', 'cash', null, 'Site vehicle fuel', -85, 1900],
    ['metroinfra_nagpur', ids.user_pilot3, 'food', 'cash', null, 'Crew meals', -84, 1200],
    ['metroinfra_nagpur', ids.user_pm2, 'misc', 'upi', null, 'Site permit fee', -82, 2000],
    ['solaris_bhadla', ids.user_pilot1, 'accommodation', 'bank_transfer', 'HDFC Bank', 'Lodging — 20-day engagement', -145, 42000],
    ['solaris_bhadla', ids.user_pilot1, 'fuel', 'cash', null, 'Vehicle fuel — Bhadla site', -140, 8200],
    ['solaris_bhadla', ids.user_pm1, 'equipment', 'bank_transfer', 'HDFC Bank', 'Battery pack replacement', -135, 15000],
  ];
  for (const [projKey, userId, category, method, bank, desc, off, amount] of expenses) {
    await q(
      `INSERT INTO project_expenses (project_id, added_by, method, bank_name, category, description, expense_date, amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [ids[`project_${projKey}`], userId, method, bank, category, desc, daysFromToday(off), amount]
    );
  }
  console.log(`✓ ${expenses.length} project expenses created across 5 projects`);

  // ── Invoice #1: real uploaded PDF + OCR-style extracted data (Metro Infra, complete project) ──
  const invBuf = await makePdf({
    title: 'TAX INVOICE',
    lines: [
      'Invoice No: SKA/2026/0091', 'Invoice Date: ' + daysFromToday(-58), '',
      'Vendor: SkyArc Aerial Solutions Pvt. Ltd.', 'GSTIN: 27SKYAR9034F1Z5', '',
      'Bill To: Metro Infra Developers', 'GSTIN: 27METRO1234F1Z6', '',
      'Description: Quarry stockpile volumetric drone survey (Aug 2026)', '',
      'Subtotal: INR 2,75,000.00', 'GST (18%): INR 49,500.00', 'Total: INR 3,24,500.00',
    ],
  });
  const invFile = await putBuffer('invoices/metroinfra-invoice-0091.pdf', invBuf, 'application/pdf');
  const inv1 = await q(
    `INSERT INTO project_invoices
     (project_id, invoice_number, invoice_date, vendor_name, vendor_gstin, buyer_name, buyer_gstin,
      subtotal, tax_amount, total_amount, file_key, file_name, status, extracted_raw, created_by)
     VALUES ($1,'SKA/2026/0091',$2,'SkyArc Aerial Solutions Pvt. Ltd.','27SKYAR9034F1Z5','Metro Infra Developers','27METRO1234F1Z6',
             275000,49500,324500,$3,'metroinfra-invoice-0091.pdf','confirmed',$4,$5)
     RETURNING id`,
    [ids.project_metroinfra_nagpur, daysFromToday(-58), invFile.file_key,
     JSON.stringify({ ocr_engine: 'demo-stub', confidence: 0.97, fields: { invoice_number: 'SKA/2026/0091', total_amount: '324500.00', vendor_gstin: '27SKYAR9034F1Z5' } }),
     ids.user_pm2]
  );
  await q(
    `INSERT INTO project_invoice_items (invoice_id, description, qty, unit, rate, taxable_value, tax_percent, tax_amount, amount, sort_order)
     VALUES ($1,'Quarry volumetric drone survey — Aug 2026',1,'lot',275000,275000,18,49500,324500,0)`,
    [inv1.rows[0].id]
  );

  // ── Invoice #2: metadata-only, draft state (Solaris Bhadla) ──
  const inv2 = await q(
    `INSERT INTO project_invoices (project_id, invoice_number, invoice_date, vendor_name, buyer_name, subtotal, tax_amount, total_amount, status, created_by)
     VALUES ($1,'SKA/2026/0078',$2,'SkyArc Aerial Solutions Pvt. Ltd.','Solaris Green Energy Pvt Ltd',4200000,756000,4956000,'draft',$3)
     RETURNING id`,
    [ids.project_solaris_bhadla, daysFromToday(-118), ids.user_pm1]
  );
  await q(
    `INSERT INTO project_invoice_items (invoice_id, description, qty, unit, rate, taxable_value, tax_percent, tax_amount, amount, sort_order)
     VALUES ($1,'Full-park thermal inspection — Bhadla Solar Park',1,'lot',4200000,4200000,18,756000,4956000,0)`,
    [inv2.rows[0].id]
  );
  console.log('✓ 2 project invoices created (1 real PDF + OCR sample, 1 draft metadata-only) with line items');
}

// ═══════════════════════════════════════════════════════════════════════
// 12. LIBRARY (categories already seeded by migration 021 — fetch their ids)
// ═══════════════════════════════════════════════════════════════════════
async function seedLibrary(ids) {
  const cats = (await q('SELECT id, name FROM library_categories')).rows;
  const catId = (name) => cats.find((c) => c.name === name)?.id;

  const folders = ['Client-Facing Templates', '2026 Compliance Renewals', 'Field Ops SOPs'];
  const folderId = {};
  for (const f of folders) {
    const r = await q(`INSERT INTO library_folders (name) VALUES ($1) RETURNING id`, [f]);
    folderId[f] = r.rows[0].id;
  }

  const tagNames = ['solar', 'wind', 'compliance', 'template', 'internal', 'client-facing', '2026', 'sop'];
  const tagId = {};
  for (const t of tagNames) {
    const r = await q(`INSERT INTO library_tags (name) VALUES ($1) RETURNING id`, [t]);
    tagId[t] = r.rows[0].id;
  }

  async function addDoc({ name, category, folder = null, access = 'all', file = null, tags = [], uploader, version = 'v1' }) {
    const r = await q(
      `INSERT INTO library_documents (category_id, name, description, file_name, file_key, version, uploaded_by, folder_id, file_size, file_type, access_level, checksum)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [catId(category), name, `${name} — SkyArc internal document (demo/fictional).`, file ? name : null, file ? file.file_key : null,
       version, uploader, folder ? folderId[folder] : null, file ? file.file_size : null, file ? 'pdf' : null, access, file ? file.checksum : null]
    );
    const docId = r.rows[0].id;
    for (const t of tags) {
      await q(`INSERT INTO library_file_tags (document_id, tag_id) VALUES ($1,$2)`, [docId, tagId[t]]);
    }
    return docId;
  }

  const brandGuidelinesV1 = await putBuffer('library/brand-guidelines-v1.pdf', await makePdf({ title: 'SkyArc Brand Guidelines (v1)', lines: ['Logo usage, color palette, and typography standards.'] }), 'application/pdf');
  const brandDocId = await addDoc({ name: 'Brand Guidelines.pdf', category: 'Branding', file: brandGuidelinesV1, tags: ['internal', 'template'], uploader: ids.user_admin, version: 'v1' });
  const brandGuidelinesV2 = await putBuffer('library/brand-guidelines-v2.pdf', await makePdf({ title: 'SkyArc Brand Guidelines (v2, Updated)', lines: ['Logo usage, color palette, and typography standards.', 'v2: added dark-mode logo variants.'] }), 'application/pdf');
  await q(`UPDATE library_documents SET file_key=$1, file_size=$2, version='v2' WHERE id=$3`, [brandGuidelinesV2.file_key, brandGuidelinesV2.file_size, brandDocId]);
  await q(`INSERT INTO library_versions (document_id, file_key, version, file_name, file_size, uploaded_by, notes) VALUES ($1,$2,'v1','brand-guidelines-v1.pdf',$3,$4,'Initial release')`,
    [brandDocId, brandGuidelinesV1.file_key, brandGuidelinesV1.file_size, ids.user_admin]);
  await q(`INSERT INTO library_versions (document_id, file_key, version, file_name, file_size, uploaded_by, notes) VALUES ($1,$2,'v2','brand-guidelines-v2.pdf',$3,$4,'Added dark-mode logo variants')`,
    [brandDocId, brandGuidelinesV2.file_key, brandGuidelinesV2.file_size, ids.user_admin]);

  await addDoc({ name: 'SkyArc Logo Pack.zip', category: 'Branding', tags: ['internal'], uploader: ids.user_admin });

  const profile = await putBuffer('library/company-profile.pdf', await makePdf({ title: 'SkyArc Aerial Solutions — Company Profile', lines: ['Drone-based inspection, mapping & survey services.', 'Sectors: Solar, Wind, T&D, Telecom, Pipeline, Infrastructure.'] }), 'application/pdf');
  await addDoc({ name: 'SkyArc Company Profile.pdf', category: 'Marketing', file: profile, tags: ['client-facing'], uploader: ids.user_admin });
  await addDoc({ name: 'Case Study — Solar O&M Programme.pdf', category: 'Marketing', tags: ['client-facing', 'solar'], uploader: ids.user_pm1 });

  const nda = await putBuffer('library/nda-template.pdf', await makePdf({ title: 'Non-Disclosure Agreement — Template', lines: ['Standard mutual NDA template for prospective clients.'] }), 'application/pdf');
  await addDoc({ name: 'NDA Template.pdf', category: 'Templates', folder: 'Client-Facing Templates', file: nda, tags: ['template', 'client-facing'], uploader: ids.user_admin });
  await addDoc({ name: 'Client Onboarding Form Template.docx', category: 'Templates', folder: 'Client-Facing Templates', tags: ['template'], uploader: ids.user_pm2 });
  await addDoc({ name: 'Quotation Format.xlsx', category: 'Templates', tags: ['template'], uploader: ids.user_pm1 });

  const checklist = await putBuffer('library/pre-flight-checklist.pdf', await makePdf({ title: 'Pre-Flight Checklist', lines: ['1. Airspace/NOTAM check', '2. Battery & firmware check', '3. GCS link test', '4. Weather check (wind <8 m/s)', '5. Site briefing to ground crew'] }), 'application/pdf');
  await addDoc({ name: 'Pre-Flight Checklist.pdf', category: 'Operation Formats', folder: 'Field Ops SOPs', file: checklist, tags: ['sop', 'internal'], uploader: ids.user_admin });
  await addDoc({ name: 'Post-Flight Report Format.pdf', category: 'Operation Formats', folder: 'Field Ops SOPs', tags: ['sop'], uploader: ids.user_pm1 });

  const dgca = await putBuffer('library/dgca-registration-demo-sample.pdf', await makePdf({ title: 'DGCA Drone Registration — Demo Sample', lines: ['UIN: UIN-MH-SKY-00101', 'This is a fictional sample document for demo purposes only.', 'Not a real DGCA filing.'] }), 'application/pdf');
  await addDoc({ name: 'DGCA Drone Registration — Demo Sample.pdf', category: 'Compliance & Certifications', folder: '2026 Compliance Renewals', access: 'admin_only', file: dgca, tags: ['compliance', '2026'], uploader: ids.user_admin });
  await addDoc({ name: 'Pilot License Renewal Tracker.pdf', category: 'Compliance & Certifications', folder: '2026 Compliance Renewals', access: 'admin_only', tags: ['compliance', '2026'], uploader: ids.user_admin });

  await addDoc({ name: 'Matrice 350 RTK — User Manual.pdf', category: 'Technical Manuals', tags: ['internal'], uploader: ids.user_pilot1 });
  const sop = await putBuffer('library/data-processing-sop.pdf', await makePdf({ title: 'Data Processing SOP (v1)', lines: ['Standard operating procedure for orthomosaic/thermal data processing.'] }), 'application/pdf');
  const sopDocId = await addDoc({ name: 'Data Processing SOP.pdf', category: 'Technical Manuals', file: sop, tags: ['sop', 'internal'], uploader: ids.user_pm1, version: 'v1' });
  const sopV2 = await putBuffer('library/data-processing-sop-v2.pdf', await makePdf({ title: 'Data Processing SOP (v2, Updated)', lines: ['Standard operating procedure for orthomosaic/thermal data processing.', 'v2: added thermal calibration step.'] }), 'application/pdf');
  await q(`UPDATE library_documents SET file_key=$1, file_size=$2, version='v2' WHERE id=$3`, [sopV2.file_key, sopV2.file_size, sopDocId]);
  await q(`INSERT INTO library_versions (document_id, file_key, version, file_name, file_size, uploaded_by, notes) VALUES ($1,$2,'v2','data-processing-sop-v2.pdf',$3,$4,'Added thermal calibration step')`,
    [sopDocId, sopV2.file_key, sopV2.file_size, ids.user_pm1]);

  await addDoc({ name: 'Offer Letter Template.pdf', category: 'HR & Admin', tags: ['template', 'internal'], uploader: ids.user_admin });
  await addDoc({ name: 'Expense Claim Format.xlsx', category: 'HR & Admin', tags: ['internal'], uploader: ids.user_admin });

  console.log('✓ 15 library documents created across 7 categories, 3 folders, 8 tags (6 real files, 2 with version history)');
}

// ═══════════════════════════════════════════════════════════════════════
// 13. ATTENDANCE, LEAVE, PAYROLL, HOLIDAYS
// ═══════════════════════════════════════════════════════════════════════
function dateRangeOverlaps(dateStr, startOffset, endOffset) {
  const d = new Date(dateStr).getTime();
  const s = new Date(daysFromToday(startOffset)).getTime();
  const e = new Date(daysFromToday(endOffset)).getTime();
  return d >= s && d <= e;
}

async function seedAttendancePayroll(ids) {
  // Company holidays (2026) — only the ones inside the 30-day attendance window matter
  // for the demo, but a fuller calendar makes the Attendance settings screen look real.
  const holidays = [
    ['2026-01-26', 'Republic Day'], ['2026-03-04', 'Holi'], ['2026-08-15', 'Independence Day'],
    ['2026-10-02', 'Gandhi Jayanti'], ['2026-11-08', 'Diwali'], ['2026-12-25', 'Christmas'],
  ];
  for (const [date, name] of holidays) {
    await q(`INSERT INTO company_holidays (date, name, year) VALUES ($1,$2,2026) ON CONFLICT (date) DO NOTHING`, [date, name]);
  }
  console.log(`✓ ${holidays.length} company holidays (2026) created`);

  // Allocation windows per pilot (mirrors seedProjects allocations) used to mark 'on_field' days.
  const onFieldWindows = {
    pilot_pilot1: [[-18, 8]], pilot_pilot3: [[-5, 8], [-88, -62]], pilot_pilot4: [[-38, -22]],
    pilot_pilot5: [[-24, -6]], pilot_copilot1: [[-18, 8]], pilot_copilot2: [[-24, -6]],
    pilot_pilot2: [], // Satara flight hasn't started yet
  };

  const pilotKeys = ['pilot_pilot1', 'pilot_pilot2', 'pilot_pilot3', 'pilot_pilot4', 'pilot_pilot5', 'pilot_copilot1', 'pilot_copilot2'];
  const leavesTakenByPilot = {};

  for (const pk of pilotKeys) {
    leavesTakenByPilot[pk] = 0;
    for (let off = -30; off <= -1; off++) {
      const date = daysFromToday(off);
      const dow = new Date(date).getUTCDay(); // 0 = Sunday
      let status;
      if (date === '2026-08-15') status = 'holiday';
      else if (dow === 0) status = 'off';
      else if ((onFieldWindows[pk] || []).some(([s, e]) => dateRangeOverlaps(date, s, e))) status = 'on_field';
      else {
        const r = Math.abs(hashCode(pk + date)) % 20;
        if (r < 13) status = 'present';
        else if (r < 15) status = 'wfh';
        else if (r < 17) status = 'half_day';
        else if (r < 19) status = 'on_leave';
        else status = 'ot';
        if (status === 'on_leave') leavesTakenByPilot[pk]++;
      }
      await q(
        `INSERT INTO pilot_attendance (pilot_id, date, status, check_in, check_out, site_location)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (pilot_id, date) DO NOTHING`,
        [ids[pk], date, status,
         ['present', 'on_field', 'half_day', 'ot'].includes(status) ? '09:30' : null,
         ['present', 'on_field', 'ot'].includes(status) ? (status === 'ot' ? '20:30' : '18:30') : (status === 'half_day' ? '14:00' : null),
         status === 'on_field' ? 'Project Site' : (status === 'wfh' ? 'Remote' : 'SkyArc Office — Pune')]
      );
    }
  }
  console.log(`✓ ${pilotKeys.length * 30} attendance records created (last 30 days, all pilots/co-pilots)`);

  // Leave balances (2026)
  for (const pk of pilotKeys) {
    await q(
      `INSERT INTO pilot_leave_balances (pilot_id, year, leaves_taken) VALUES ($1,2026,$2)`,
      [ids[pk], leavesTakenByPilot[pk]]
    );
  }
  console.log('✓ 7 pilot leave-balance records created (2026)');

  // Payroll settings — varies by seniority
  const salaryByPilot = {
    pilot_pilot1: 48000, pilot_pilot2: 38000, pilot_pilot3: 36000, pilot_pilot4: 36000, pilot_pilot5: 47000,
    pilot_copilot1: 24000, pilot_copilot2: 23000,
  };
  for (const pk of pilotKeys) {
    await q(
      `INSERT INTO pilot_payroll_settings (pilot_id, base_monthly_salary, field_per_diem_bonus, unapproved_absent_deduction, per_flight_bonus)
       VALUES ($1,$2,500,1000,300)`,
      [ids[pk], salaryByPilot[pk]]
    );
  }
  console.log('✓ 7 pilot payroll-settings records created');

  // Payroll records — July (paid) and August 2026 (processed)
  for (const pk of pilotKeys) {
    const base = salaryByPilot[pk];
    for (const [month, status] of [[7, 'paid'], [8, 'processed']]) {
      const present = 20 + (Math.abs(hashCode(pk + month)) % 4);
      const onField = Math.abs(hashCode(pk + month + 'f')) % 6;
      const leave = Math.abs(hashCode(pk + month + 'l')) % 2;
      const fieldBonus = onField * 500;
      const net = base + fieldBonus;
      await q(
        `INSERT INTO pilot_payroll_records
         (pilot_id, month, year, working_days, days_present, days_on_field, days_leave, base_salary, field_bonus_total, net_salary, status)
         VALUES ($1,$2,2026,26,$3,$4,$5,$6,$7,$8,$9)`,
        [ids[pk], month, present, onField, leave, base, fieldBonus, net, status]
      );
    }
  }
  console.log('✓ 14 pilot payroll records created (Jul–Aug 2026)');
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (Math.imul(31, h) + str.charCodeAt(i)) | 0; }
  return h;
}

// ═══════════════════════════════════════════════════════════════════════
// 14. CALENDAR EVENTS (manual) & NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════
async function seedCalendarAndNotifications(ids) {
  const events = [
    ['BVLOS Refresher Training — Kabir Singh', 'training', 'pilot', ids.pilot_pilot2, 5, 6, 'SkyArc Training Center, Pune'],
    ['Scheduled Maintenance — Sky-05 (Matrice 30T)', 'maintenance', 'drone', ids.drone_d5, 5, 5, 'SkyArc Service Bay'],
    ['Drone World Expo 2026 — Mumbai', 'expo', 'all', null, 40, 42, 'Bombay Exhibition Centre, Mumbai'],
    ['Planned Leave — Vikram Desai', 'leave', 'pilot', ids.pilot_pilot4, 12, 14, null],
    ['Quarterly Client Review — Solaris Green Energy', 'meeting', 'all', null, 7, 7, 'SkyArc Head Office, Pune'],
    ['NationalPipe Final Report Submission Deadline', 'deadline', 'all', null, 3, 3, null],
  ];
  for (const [title, type, resType, resId, startOff, endOff, loc] of events) {
    await q(
      `INSERT INTO calendar_events (title, event_type, resource_type, resource_id, start_date, end_date, location)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [title, type, resType, resId, daysFromToday(startOff), daysFromToday(endOff), loc]
    );
  }
  console.log(`✓ ${events.length} manual calendar events created`);

  const notifications = [
    [ids.user_admin, 'New deliverable uploaded', 'Thermal_Anomaly_Report.pdf was uploaded on Solaris Kolhapur 50MW O&M Thermal Inspection.', 'deliverable', ids.deliverable_ortho, false, -10],
    [ids.user_admin, 'Pilot license expiring soon', 'Kabir Singh’s DGCA pilot license expires in 18 days.', 'pilot', ids.pilot_pilot2, false, -1],
    [ids.user_admin, 'Drone insurance expiring soon', 'Sky-02 (Matrice 300 RTK) insurance expires in 22 days.', 'drone', ids.drone_d2, false, -1],
    [ids.user_admin, 'Project needs attention', 'TeleTower Mumbai Rooftop Structural Audit needs setup — no crew allocated yet.', 'project', ids.project_teletower_mumbai, false, -2],
    [ids.user_admin, 'Follow-up due soon', 'Follow-up with Ganga Gas Pipelines Pvt Ltd is due in 2 days.', 'bd_client', ids.bd_bd6, true, -3],
    [ids.user_pm1, 'Deliverable rejected', 'Inspection_Report_Draft.pdf on Solaris Kolhapur was rejected — GPS coordinates required.', 'deliverable', ids.deliverable_rejected, true, -6],
    [ids.user_admin, 'Pipeline converted to project', 'Ratlam Solar Farm — New Site Feasibility Survey was converted into a project.', 'project', ids.project_ratlam_new_site, true, -4],
    [ids.user_pm2, 'Invoice confirmed', 'Invoice SKA/2026/0091 for Metro Infra Developers was confirmed.', 'invoice', null, true, -58],
    [ids.user_pm1, 'New allocation assigned', 'You were assigned as project manager on Windforce Satara Turbine Blade Survey.', 'project', ids.project_windforce_satara, true, -14],
    [ids.user_admin, 'New pipeline lead added', 'Aravali Solar Infra Pvt Ltd was added to the sales pipeline.', 'bd_client', ids.bd_bd1, true, -20],
  ];
  for (const [userId, title, message, entityType, entityId, isRead, off] of notifications) {
    await q(
      `INSERT INTO notifications (user_id, title, message, is_read, entity_type, entity_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6, CURRENT_TIMESTAMP + interval '${off} days')`,
      [userId, title, message, isRead, entityType, entityId]
    );
  }
  console.log(`✓ ${notifications.length} notifications created`);
}

// ═══════════════════════════════════════════════════════════════════════
// 15. ACTIVITY LOG (audit trail) — hand-written since we bypassed the API
// ═══════════════════════════════════════════════════════════════════════
async function seedActivityLog(ids) {
  const entries = [
    [ids.user_admin, 'CREATE_USER', 'user', ids.user_pm1, -60, { name: 'Rohan Mehta', role: 'project_manager' }],
    [ids.user_admin, 'CREATE_USER', 'user', ids.user_pm2, -60, { name: 'Sneha Kulkarni', role: 'project_manager' }],
    [ids.user_admin, 'CREATE_PILOT', 'pilot', ids.pilot_pilot1, -58, { name: 'Arjun Nair', employee_id: 'SKA-PLT-001' }],
    [ids.user_admin, 'CREATE_DRONE', 'drone', ids.drone_d1, -58, { name: 'Sky-01', model: 'Matrice 350 RTK' }],
    [ids.user_pm1, 'CREATE_CLIENT', 'client', ids.client_solaris, -55, { name: 'Solaris Green Energy Pvt Ltd' }],
    [ids.user_pm1, 'CREATE_PIPELINE', 'pipeline', ids.pipeline_p7, -45, { name: 'Ratlam Solar Farm — New Site Feasibility Survey', stage: 'inquiry' }],
    [ids.user_pm1, 'UPDATE_PIPELINE_STAGE', 'pipeline', ids.pipeline_p7, -30, { stage: 'onboarding' }],
    [ids.user_pm1, 'CONVERT_PIPELINE', 'pipeline', ids.pipeline_p7, -20, { converted_project_id: ids.project_ratlam_new_site }],
    [ids.user_pm1, 'CREATE_PROJECT', 'project', ids.project_solaris_kolhapur, -20, { name: 'Solaris Kolhapur 50MW O&M Thermal Inspection', status: 'initiate' }],
    [ids.user_pm1, 'UPDATE_PROJECT_STATUS', 'project', ids.project_solaris_kolhapur, -18, { from: 'initiate', to: 'planned' }],
    [ids.user_pm1, 'UPDATE_PROJECT_STATUS', 'project', ids.project_solaris_kolhapur, -17, { from: 'planned', to: 'on_going' }],
    [ids.user_pm1, 'CREATE_ALLOCATION', 'allocation', ids.project_solaris_kolhapur, -17, { pilot: 'Arjun Nair', drone: 'Sky-01' }],
    [ids.user_pm1, 'CREATE_ESTIMATION', 'estimation', ids.project_solaris_kolhapur, -16, { name: 'Solaris Kolhapur — O&M Thermal Inspection Costing' }],
    [ids.user_pilot1, 'UPLOAD_DELIVERABLE', 'deliverable', ids.deliverable_ortho, -12, { name: 'Orthomosaic_Block_A.pdf' }],
    [ids.user_pilot1, 'UPLOAD_DELIVERABLE', 'deliverable', ids.deliverable_ortho, -8, { name: 'Orthomosaic_Block_A.pdf (v2)' }],
    [ids.user_pilot3, 'UPLOAD_DELIVERABLE', 'deliverable', ids.deliverable_rejected, -6, { name: 'Inspection_Report_Draft.pdf' }],
    [ids.user_pm1, 'REJECT_DELIVERABLE', 'deliverable', ids.deliverable_rejected, -5, { reason: 'GPS coordinates required in anomaly table' }],
    [ids.user_pm1, 'ADD_EXPENSE', 'project_expense', ids.project_solaris_kolhapur, -11, { category: 'accommodation', amount: 27000 }],
    [ids.user_pm2, 'CREATE_PROJECT', 'project', ids.project_metroinfra_nagpur, -95, { name: 'Metro Infra Nagpur Earthwork Volumetric Study' }],
    [ids.user_pm2, 'UPDATE_PROJECT_STATUS', 'project', ids.project_metroinfra_nagpur, -60, { from: 'executed', to: 'complete' }],
    [ids.user_pm2, 'CREATE_INVOICE', 'project_invoice', ids.project_metroinfra_nagpur, -58, { invoice_number: 'SKA/2026/0091', total_amount: 324500 }],
    [ids.user_admin, 'CREATE_LIBRARY_DOCUMENT', 'library_document', null, -50, { name: 'SkyArc Company Profile.pdf' }],
    [ids.user_admin, 'UPDATE_COMPANY_CONFIG', 'company_config', null, -70, { company_name: 'SkyArc Aerial Solutions Pvt. Ltd.' }],
    [ids.user_pm1, 'CREATE_BD_CLIENT', 'bd_client', ids.bd_bd1, -20, { name: 'Aravali Solar Infra Pvt Ltd' }],
    [ids.user_pm1, 'LOG_TOUCHPOINT', 'bd_touchpoint', ids.bd_bd1, -19, { interaction_type: 'email' }],
    [ids.user_pm2, 'CREATE_ALLOCATION', 'allocation', ids.project_windforce_satara, -3, { pilot: 'Kabir Singh', drone: 'Mavic 3 Enterprise' }],
    [ids.user_admin, 'LOGIN', 'user', ids.user_admin, -1, { method: 'password' }],
    [ids.user_pm1, 'LOGIN', 'user', ids.user_pm1, -1, { method: 'password' }],
    [ids.user_pilot1, 'LOGIN', 'user', ids.user_pilot1, -2, { method: 'password' }],
  ];
  for (const [userId, action, entityType, entityId, off, newValue] of entries) {
    await q(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, new_value, created_at)
       VALUES ($1,$2,$3,$4,$5, CURRENT_TIMESTAMP + interval '${off} days')`,
      [userId, action, entityType, entityId, JSON.stringify(newValue)]
    );
  }
  console.log(`✓ ${entries.length} activity log entries created (audit trail)`);
}

main();
