import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { kml as kmlToGeoJson } from '@tmcw/togeojson';
import { isEndOnOrAfterStart, toInputDate } from '../../utils/dateUtils';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { ClientSelect } from '../../components/ui/ClientSelect';
import { INDIAN_STATES } from '../../utils/constants';
import { useProjectTypes } from '../../hooks/useProjectTypes';
import useAuth from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { useDialog } from '../../context/DialogContext';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { UnsavedChangesModal } from '../../components/ui/UnsavedChangesModal';

const STEPS = [
  { id: 1, name: 'Basic Information',    icon: 'info' },
  { id: 2, name: 'Location & Geographic',icon: 'map' },
  { id: 3, name: 'Project Scope',        icon: 'description' },
  { id: 4, name: 'Resource Allocation',  icon: 'group' },
  { id: 5, name: 'Documents & KML',      icon: 'upload_file' },
  { id: 6, name: 'Final Review',         icon: 'task' },
];

// ── Label shorthand ────────────────────────────────────────────────────────
const LBL = 'text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block';
const SEL = 'w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-900 text-sm';

// ── Toggle button group ────────────────────────────────────────────────────
const ToggleGroup = ({ label, name, value, options, onChange }) => (
  <div>
    <label className={LBL}>{label}</label>
    <div className="flex gap-2 flex-wrap">
      {options.map(opt => (
        <button key={opt.value} type="button"
          onClick={() => onChange({ target: { name, value: opt.value } })}
          className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
            value === opt.value ? 'bg-primary text-on-primary border-primary shadow-sm' : 'bg-surface text-slate-600 border-slate-200 hover:border-slate-300'
          }`}>
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

// ── Build scope API payload from formData ──────────────────────────────────
const buildScopePayload = (fd) => {
  const type = fd.project_type;
  const base = {
    scope_type: type,
    special_instructions: fd.scope_special_instructions || null,
  };

  switch (type) {
    case 'solar_pv':
      return {
        ...base,
        area_hectares: fd.scope_area_hectares  || null,
        deliverables_expected: {
          capacity_mwp: fd.scope_capacity_mwp,
          module_count: fd.scope_module_count,
          sensor_mode:  fd.scope_sensor_mode,
        },
      };
    case 'wind':
      return {
        ...base,
        asset_count: fd.scope_turbine_count || null,
        deliverables_expected: {
          turbine_count:   fd.scope_turbine_count,
          hub_height_m:    fd.scope_hub_height_m,
          inspection_type: fd.scope_inspection_type,
        },
      };
    case 'td_lines':
      return {
        ...base,
        length_km:   fd.scope_line_length_km || null,
        asset_count: fd.scope_tower_count    || null,
        deliverables_expected: {
          line_length_km: fd.scope_line_length_km,
          voltage_kv:     fd.scope_voltage_kv,
          terrain_type:   fd.scope_terrain_type,
          tower_count:    fd.scope_tower_count,
        },
      };
    case 'tower':
      return {
        ...base,
        asset_count: fd.scope_tower_count || null,
        deliverables_expected: {
          tower_count:  fd.scope_tower_count,
          tower_type:   fd.scope_tower_type,
          height_min_m: fd.scope_height_min_m,
          height_max_m: fd.scope_height_max_m,
        },
      };
    case 'pipeline':
      return {
        ...base,
        length_km: fd.scope_pipe_length_km || null,
        deliverables_expected: {
          pipe_length_km: fd.scope_pipe_length_km,
          diameter_mm:    fd.scope_diameter_mm,
          terrain_type:   fd.scope_terrain_type,
        },
      };
    case 'volumetric':
      return {
        ...base,
        area_hectares: fd.scope_area_hectares   || null,
        asset_count:   fd.scope_stockpile_count || null,
        deliverables_expected: {
          area_hectares:  fd.scope_area_hectares,
          stockpile_count: fd.scope_stockpile_count,
        },
      };
    default:
      return { ...base, deliverables_expected: { notes: fd.scope_special_instructions } };
  }
};

// ── Scope summary for review step ─────────────────────────────────────────
const SCOPE_SUMMARY_LABELS = {
  solar_pv:    fd => [
    { l: 'Capacity', v: fd.scope_capacity_mwp ? `${fd.scope_capacity_mwp} MWp` : null },
    { l: 'Modules',  v: fd.scope_module_count ? `${Number(fd.scope_module_count).toLocaleString()} units` : null },
    { l: 'Sensor',   v: fd.scope_sensor_mode },
  ],
  wind:        fd => [
    { l: 'Turbines',    v: fd.scope_turbine_count ? `${fd.scope_turbine_count} units` : null },
    { l: 'Hub Height',  v: fd.scope_hub_height_m ? `${fd.scope_hub_height_m} m` : null },
    { l: 'Inspection',  v: fd.scope_inspection_type },
  ],
  td_lines:    fd => [
    { l: 'Line Length', v: fd.scope_line_length_km ? `${fd.scope_line_length_km} km` : null },
    { l: 'Voltage',     v: fd.scope_voltage_kv ? `${fd.scope_voltage_kv} kV` : null },
    { l: 'Towers',      v: fd.scope_tower_count ? `${fd.scope_tower_count} units` : null },
    { l: 'Terrain',     v: fd.scope_terrain_type },
  ],
  tower:       fd => [
    { l: 'Tower Count', v: fd.scope_tower_count ? `${fd.scope_tower_count} units` : null },
    { l: 'Tower Type',  v: fd.scope_tower_type },
    { l: 'Height',      v: (fd.scope_height_min_m && fd.scope_height_max_m) ? `${fd.scope_height_min_m}–${fd.scope_height_max_m} m` : null },
  ],
  pipeline:    fd => [
    { l: 'Length',    v: fd.scope_pipe_length_km ? `${fd.scope_pipe_length_km} km` : null },
    { l: 'Diameter',  v: fd.scope_diameter_mm ? `${fd.scope_diameter_mm} mm` : null },
    { l: 'Terrain',   v: fd.scope_terrain_type },
  ],
  volumetric:  fd => [
    { l: 'Area',        v: fd.scope_area_hectares ? `${fd.scope_area_hectares} ha` : null },
    { l: 'Stockpiles',  v: fd.scope_stockpile_count ? `${fd.scope_stockpile_count} units` : null },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
const ProjectForm = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    useAuth();
    const { showToast } = useToast();
    const { confirmDialog } = useDialog();
    const projectTypes = useProjectTypes();
    const [isDirty, setIsDirty] = useState(false);
    const blocker = useUnsavedGuard(isDirty);

    const [currentStep, setCurrentStep]       = useState(1);
    const [loading, setLoading]               = useState(false);
    const [fetchingResources, setFetchingResources] = useState(false);
    const [pilots, setPilots]                 = useState([]);
    const [drones, setDrones]                 = useState([]);
    const [kmlFile, setKmlFile]               = useState(null);
    const [documentFiles, setDocumentFiles]   = useState([]);
    const [pilotWarning, setPilotWarning]         = useState(null);
    const [secPilotWarning, setSecPilotWarning]   = useState(null);
    const [droneWarning, setDroneWarning]         = useState(null);
    const [fieldErrors, setFieldErrors]           = useState({});

    const [formData, setFormData] = useState({
        // ── Project core ─────────────────────────────────────
        name: '', client_name: '', client_id: '', project_type: 'solar_pv', description: '',
        start_date: '', end_date: '', state: '', district: '',
        location_name: '', latitude: '', longitude: '',
        po_number: '', work_order_number: '', contact_person: '',
        contact_number: '', contact_email: '',
        project_value: '',
        status: 'initiate',
        drone_flying_zone: '',
        // ── Resource allocation ───────────────────────────────
        pilot_id: '', drone_id: '', secondary_pilot_id: '', secondary_drone_id: '',
        // ── Scope — shared ────────────────────────────────────
        scope_special_instructions: '',
        // ── Scope — Solar PV ─────────────────────────────────
        scope_capacity_mwp: '', scope_module_count: '', scope_sensor_mode: 'both',
        scope_area_hectares: '',
        // ── Scope — Wind ─────────────────────────────────────
        scope_turbine_count: '', scope_hub_height_m: '', scope_inspection_type: 'visual',
        // ── Scope — T&D Lines ─────────────────────────────────
        scope_line_length_km: '', scope_voltage_kv: '', scope_terrain_type: 'flat', scope_tower_count: '',
        // ── Scope — Tower ─────────────────────────────────────
        scope_tower_type: 'lattice', scope_height_min_m: '', scope_height_max_m: '',
        // ── Scope — Pipeline ──────────────────────────────────
        scope_pipe_length_km: '', scope_diameter_mm: '',
        // ── Scope — Volumetric ────────────────────────────────
        scope_stockpile_count: '',
    });

    // ─── Fetch existing project + scope if editing ────────────────────────
    useEffect(() => {
        if (id && id !== 'new') {
            const fetchProject = async () => {
                try {
                    const [projRes, scopeRes] = await Promise.all([
                        axiosInstance.get(ENDPOINTS.PROJECTS.GET_BY_ID(id)),
                        axiosInstance.get(ENDPOINTS.PROJECTS.SCOPE(id)).catch(() => ({ data: { data: null } })),
                    ]);
                    const data = projRes.data.data || {};
                    const scope = scopeRes.data.data;
                    const de = scope?.deliverables_expected || {};

                    setFormData(prev => ({
                        ...prev,
                        ...data,
                        start_date:    toInputDate(data.start_date),
                        end_date:      toInputDate(data.end_date),
                        project_value: data.project_value != null ? String(data.project_value) : '',
                        // Pre-fill scope fields
                        scope_special_instructions: scope?.special_instructions || '',
                        // Solar PV
                        scope_capacity_mwp:  de.capacity_mwp  || '',
                        scope_module_count:  de.module_count  || '',
                        scope_sensor_mode:   de.sensor_mode   || 'both',
                        scope_area_hectares: de.area_hectares  || scope?.area_hectares || '',
                        // Wind
                        scope_turbine_count:   de.turbine_count   || String(scope?.asset_count || ''),
                        scope_hub_height_m:    de.hub_height_m    || '',
                        scope_inspection_type: de.inspection_type || 'visual',
                        // T&D Lines
                        scope_line_length_km: de.line_length_km || String(scope?.length_km || ''),
                        scope_voltage_kv:     de.voltage_kv     || '',
                        scope_terrain_type:   de.terrain_type   || 'flat',
                        scope_tower_count:    de.tower_count    || String(scope?.asset_count || ''),
                        // Tower
                        scope_tower_type:   de.tower_type   || 'lattice',
                        scope_height_min_m: de.height_min_m || '',
                        scope_height_max_m: de.height_max_m || '',
                        // Pipeline
                        scope_pipe_length_km: de.pipe_length_km || String(scope?.length_km || ''),
                        scope_diameter_mm:    de.diameter_mm    || '',
                        // Volumetric
                        scope_stockpile_count: de.stockpile_count || String(scope?.asset_count || ''),
                    }));
                } catch (err) {
                    showToast("Failed to fetch project details", "error");
                }
            };
            fetchProject();
        } else {
            const draft = localStorage.getItem('project_draft');
            if (draft) {
                try {
                    const parsed = JSON.parse(draft);
                    setFormData(prev => ({ ...prev, ...parsed }));
                    showToast("Restored unsaved draft");
                } catch (e) { localStorage.removeItem('project_draft'); }
            }
        }
    }, [id, showToast]);

    // ─── Auto-save ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (id && id !== 'new') return;
        const timer = setInterval(() => {
            localStorage.setItem('project_draft', JSON.stringify(formData));
        }, 30000);
        return () => clearInterval(timer);
    }, [formData, id]);

    // ─── Fetch resources ────────────────────────────────────────────────────
    const fetchResources = useCallback(async () => {
        setFetchingResources(true);
        try {
            const [pRes, dRes] = await Promise.all([
                // Pilot slots only — co-pilots are allocated from the project's Resources tab
                axiosInstance.get(ENDPOINTS.RESOURCES.PILOTS, { params: { crew_role: 'pilot', limit: 100 } }),
                axiosInstance.get(ENDPOINTS.RESOURCES.DRONES, { params: { limit: 100 } }),
            ]);
            setPilots(Array.isArray(pRes.data.data) ? pRes.data.data : []);
            setDrones(Array.isArray(dRes.data.data) ? dRes.data.data : []);
        } catch (e) {
            showToast("Failed to load resource inventory", "error");
        } finally {
            setFetchingResources(false);
        }
    }, [showToast]);

    useEffect(() => {
        if (currentStep === 4) fetchResources();
    }, [currentStep, fetchResources]);

    // ─── Pilot availability checks ──────────────────────────────────────────
    useEffect(() => {
        if (formData.pilot_id && formData.start_date && formData.end_date) {
            axiosInstance.get(ENDPOINTS.RESOURCES.PILOT_AVAIL(formData.pilot_id), {
                params: { start: formData.start_date, end: formData.end_date }
            }).then(res => {
                const d = res.data.data;
                if (!d.is_available) {
                    if (d.license_expired)   setPilotWarning(`Pilot license expired on ${d.license_expiry_date} — cannot be allocated`);
                    else                     setPilotWarning('Pilot has a conflicting schedule or approved leave');
                } else if (d.license_expiring_in_window) {
                    setPilotWarning(`⚠ Pilot license expires ${d.license_expiry_date} — within the project window`);
                } else {
                    setPilotWarning(null);
                }
            }).catch(() => setPilotWarning(null));
        } else { setPilotWarning(null); }
    }, [formData.pilot_id, formData.start_date, formData.end_date]);

    useEffect(() => {
        if (formData.secondary_pilot_id && formData.start_date && formData.end_date) {
            axiosInstance.get(ENDPOINTS.RESOURCES.PILOT_AVAIL(formData.secondary_pilot_id), {
                params: { start: formData.start_date, end: formData.end_date }
            }).then(res => {
                const d = res.data.data;
                if (!d.is_available) {
                    setSecPilotWarning(d.license_expired
                        ? `License expired on ${d.license_expiry_date}`
                        : 'Secondary pilot has a conflicting schedule or leave');
                } else if (d.license_expiring_in_window) {
                    setSecPilotWarning(`⚠ License expires ${d.license_expiry_date} — within project window`);
                } else {
                    setSecPilotWarning(null);
                }
            }).catch(() => setSecPilotWarning(null));
        } else { setSecPilotWarning(null); }
    }, [formData.secondary_pilot_id, formData.start_date, formData.end_date]);

    // Drone warning — computed from already-fetched drone data (no extra endpoint needed)
    useEffect(() => {
        if (!formData.drone_id || !formData.start_date || !formData.end_date) {
            setDroneWarning(null);
            return;
        }
        const drone = drones.find(d => d.id === formData.drone_id);
        if (!drone) { setDroneWarning(null); return; }

        const warnings = [];
        const start = formData.start_date.substring(0, 10);
        const end   = formData.end_date.substring(0, 10);

        if (drone.next_maintenance) {
            const maint = String(drone.next_maintenance).substring(0, 10);
            if (maint >= start && maint <= end)
                warnings.push(`⚠ Drone maintenance scheduled on ${maint} — within project window`);
        }
        if (drone.insurance_expiry) {
            const ins = String(drone.insurance_expiry).substring(0, 10);
            const today = new Date().toISOString().substring(0, 10);
            if (ins < today)
                warnings.push(`⚠ Drone insurance expired on ${ins}`);
            else if (ins <= end)
                warnings.push(`⚠ Drone insurance expires ${ins} — within project window`);
        }
        setDroneWarning(warnings.length ? warnings.join(' · ') : null);
    }, [formData.drone_id, formData.start_date, formData.end_date, drones]);

    // ─── Handlers ───────────────────────────────────────────────────────────
    const handleChange = (e) => {
        setIsDirty(true);
        const { name, value } = e.target;
        if (name === 'latitude' && value.includes(',')) {
            const parts = value.split(',');
            const lat = parts[0].replace(/[^0-9.-]/g, '').trim();
            const lng = parts[1].replace(/[^0-9.-]/g, '').trim();
            setFormData(prev => ({ ...prev, latitude: lat, longitude: lng || prev.longitude }));
            showToast("Auto-parsed Google Maps coordinates", "success");
            return;
        }
        setFormData(prev => ({ ...prev, [name]: value }));
        setFieldErrors(fe => (fe[name] ? { ...fe, [name]: undefined } : fe));
    };

    // Pure validation — returns an errors object for the given step (no side effects).
    const getStepErrors = (step) => {
        const errs = {};
        if (step === 1) {
            if (!formData.name.trim())        errs.name = 'Project name is required.';
            if (!formData.client_name.trim()) errs.client_name = 'Client name is required.';
        }
        if (step === 2) {
            if (!formData.state.trim())  errs.state = 'State is required.';

            // Latitude — required + valid range (-90 to 90)
            if (String(formData.latitude).trim() === '') {
                errs.latitude = 'Latitude is required.';
            } else if (isNaN(Number(formData.latitude)) || Number(formData.latitude) < -90 || Number(formData.latitude) > 90) {
                errs.latitude = 'Enter a valid latitude (-90 to 90).';
            }
            // Longitude — required + valid range (-180 to 180)
            if (String(formData.longitude).trim() === '') {
                errs.longitude = 'Longitude is required.';
            } else if (isNaN(Number(formData.longitude)) || Number(formData.longitude) < -180 || Number(formData.longitude) > 180) {
                errs.longitude = 'Enter a valid longitude (-180 to 180).';
            }

            if (!formData.start_date)    errs.start_date = 'Start date is required.';
            if (!formData.end_date)      errs.end_date = 'End date is required.';
            if (formData.start_date && formData.end_date && !isEndOnOrAfterStart(formData.start_date, formData.end_date)) {
                errs.end_date = 'End date must be on or after the start date.';
            }
        }
        return errs;
    };

    // Validate one step, surface its errors inline, and toast instantly if invalid.
    const validateStep = (step) => {
        const errs = getStepErrors(step);
        setFieldErrors(errs);
        if (Object.keys(errs).length) {
            showToast(Object.values(errs)[0] || 'Please complete the required fields before continuing.', 'error');
            return false;
        }
        return true;
    };

    const nextStep = () => { if (validateStep(currentStep)) setCurrentStep(prev => Math.min(prev + 1, STEPS.length)); };
    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

    // Clickable stepper. Going back (or to the current step) is always allowed.
    // Jumping forward validates every step in between — the first invalid step
    // stops navigation, surfaces its errors, and shows an instant toast.
    const goToStep = (target) => {
        if (target === currentStep) return;
        if (target < currentStep) { setFieldErrors({}); setCurrentStep(target); return; }
        for (let s = currentStep; s < target; s++) {
            const errs = getStepErrors(s);
            if (Object.keys(errs).length) {
                setCurrentStep(s);
                setFieldErrors(errs);
                showToast(Object.values(errs)[0] || `Complete Step ${s} before continuing.`, 'error');
                return;
            }
        }
        setFieldErrors({});
        setCurrentStep(target);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        // Final safety net — never submit if a required step is incomplete.
        for (const step of [1, 2]) {
            const errs = getStepErrors(step);
            if (Object.keys(errs).length) {
                setCurrentStep(step);
                setFieldErrors(errs);
                showToast(Object.values(errs)[0] || `Complete Step ${step} before saving.`, 'error');
                return;
            }
        }
        setLoading(true);
        try {
            let projectId = id;
            if (id && id !== 'new') {
                await axiosInstance.put(ENDPOINTS.PROJECTS.UPDATE(id), formData);
                showToast("Project parameters updated successfully");
            } else {
                const res = await axiosInstance.post(ENDPOINTS.PROJECTS.CREATE, formData);
                projectId = res.data.data.id;
                localStorage.removeItem('project_draft');
                showToast("New project protocol initiated");

                // ── Explicit primary allocation from the frontend ──────────────
                // Done here (not inside the project creation endpoint) so any
                // conflict is visible and retried with force automatically.
                if (formData.pilot_id || formData.drone_id) {
                    try {
                        await axiosInstance.post(ENDPOINTS.PROJECTS.RESOURCES(projectId), {
                            pilot_id:   formData.pilot_id   || null,
                            drone_id:   formData.drone_id   || null,
                            start_date: formData.start_date,
                            end_date:   formData.end_date,
                            is_primary: true,
                        });
                    } catch (allocErr) {
                        // Soft conflict (409 + conflict payload) — allocate with force and show warnings
                        const conflict = allocErr.response?.data?.conflict;
                        if (allocErr.response?.status === 409 && Array.isArray(conflict) && conflict.length) {
                            const CONFLICT_LABELS = {
                                pilot_license_expiring_during_allocation: 'Pilot license expires during project window',
                                drone_maintenance: 'Drone maintenance scheduled during project window',
                                drone_insurance_expired: 'Drone insurance has expired',
                                pilot_leave: 'Pilot is on leave during this period',
                                pilot_training: 'Pilot is in training during this period',
                                pilot: 'Pilot already booked on another project',
                                drone: 'Drone already booked on another project',
                            };
                            conflict.forEach(c => {
                                showToast(`⚠ ${CONFLICT_LABELS[c.type] || c.type}`, 'warning');
                            });
                            try {
                                await axiosInstance.post(ENDPOINTS.PROJECTS.RESOURCES(projectId), {
                                    pilot_id:        formData.pilot_id   || null,
                                    drone_id:        formData.drone_id   || null,
                                    start_date:      formData.start_date,
                                    end_date:        formData.end_date,
                                    is_primary:      true,
                                    force:           true,
                                    override_reason: 'Soft conflict acknowledged during project creation',
                                });
                            } catch (forceErr) {
                                showToast(`Resource allocation failed: ${forceErr.response?.data?.message || forceErr.message}. Allocate from the Resources tab.`, 'warning');
                            }
                        } else {
                            showToast(`Resource allocation failed: ${allocErr.response?.data?.message || allocErr.message}. Allocate from the Resources tab.`, 'warning');
                        }
                    }
                }

                // Secondary allocation
                if (formData.secondary_pilot_id || formData.secondary_drone_id) {
                    try {
                        await axiosInstance.post(ENDPOINTS.PROJECTS.RESOURCES(projectId), {
                            pilot_id:   formData.secondary_pilot_id || null,
                            drone_id:   formData.secondary_drone_id || null,
                            start_date: formData.start_date,
                            end_date:   formData.end_date,
                            is_primary: false,
                        });
                    } catch (secErr) {
                        const secConflict = secErr.response?.data?.conflict;
                        if (secErr.response?.status === 409 && Array.isArray(secConflict) && secConflict.length) {
                            try {
                                await axiosInstance.post(ENDPOINTS.PROJECTS.RESOURCES(projectId), {
                                    pilot_id: formData.secondary_pilot_id || null,
                                    drone_id: formData.secondary_drone_id || null,
                                    start_date: formData.start_date,
                                    end_date: formData.end_date,
                                    is_primary: false,
                                    force: true,
                                    override_reason: 'Soft conflict acknowledged during project creation',
                                });
                            } catch (_) {}
                        }
                    }
                }
            }

            // Save structured scope (always PUT — backend does upsert)
            try {
                await axiosInstance.put(ENDPOINTS.PROJECTS.SCOPE(projectId), buildScopePayload(formData));
            } catch (scopeErr) {
                showToast(`Scope save warning: ${scopeErr?.message || 'Unknown error'}`, 'warning');
            }

            // Upload KML: store as document AND parse to GeoJSON for map overlay
            if (kmlFile) {
                const fd = new FormData();
                fd.append('file', kmlFile);
                try {
                    await axiosInstance.post(ENDPOINTS.PROJECTS.DOCUMENTS(projectId), fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                } catch (e) { showToast('Failed to upload KML file', 'error'); }

                // Parse KML → GeoJSON client-side and push to map endpoint
                try {
                    const text = await kmlFile.text();
                    const xmlDoc = new DOMParser().parseFromString(text, 'text/xml');
                    const geojson = kmlToGeoJson(xmlDoc);
                    if (geojson?.features?.length) {
                        // Compute centroid from first feature's coordinates
                        const coords = geojson.features[0]?.geometry?.coordinates;
                        const flatCoords = coords ? coords.flat(Infinity) : [];
                        const lngs = flatCoords.filter((_, i) => i % 2 === 0);
                        const lats = flatCoords.filter((_, i) => i % 2 === 1);
                        const centerLng = lngs.length ? lngs.reduce((a, b) => a + b, 0) / lngs.length : null;
                        const centerLat = lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : null;
                        await axiosInstance.post(ENDPOINTS.PROJECTS.MAP(projectId), {
                            geojson_data: geojson,
                            center_lat: centerLat,
                            center_lng: centerLng,
                        });
                        showToast('KML boundary parsed and saved to map', 'success');
                    }
                } catch (parseErr) {
                    showToast('KML boundary could not be parsed — project saved but map overlay was skipped', 'warning');
                }
            }
            for (const file of documentFiles) {
                const fd = new FormData();
                fd.append('file', file);
                try {
                    await axiosInstance.post(ENDPOINTS.PROJECTS.DOCUMENTS(projectId), fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                } catch (e) { showToast(`Failed to upload ${file.name}`, "error"); }
            }

            setIsDirty(false);
            navigate(`/projects/${projectId}`);
        } catch (err) {
            showToast(err.userMessage, "error");
        } finally {
            setLoading(false);
        }
    };

    // ─── Step 3 — type-specific scope fieldsets ──────────────────────────────
    const renderScopeFields = () => {
        const type = formData.project_type;
        const sharedNote = (
            <div className="md:col-span-2">
                <label className={LBL}>Special Instructions / Deliverable Notes</label>
                <textarea
                    name="scope_special_instructions"
                    value={formData.scope_special_instructions}
                    onChange={handleChange}
                    rows={3}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-900 text-sm resize-none"
                    placeholder="Site access conditions, safety requirements, deliverable format..."
                />
            </div>
        );

        switch (type) {
            case 'solar_pv':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input label="Plant Capacity (MWp)" name="scope_capacity_mwp" type="number" value={formData.scope_capacity_mwp} onChange={handleChange} placeholder="e.g. 50" />
                        <Input label="Module Count" name="scope_module_count" type="number" value={formData.scope_module_count} onChange={handleChange} placeholder="e.g. 200000" />
                        <Input label="Site Area (Hectares)" name="scope_area_hectares" type="number" value={formData.scope_area_hectares} onChange={handleChange} placeholder="e.g. 120" />
                        <ToggleGroup label="Sensor Payload" name="scope_sensor_mode" value={formData.scope_sensor_mode} onChange={handleChange} options={[
                            { value: 'rgb',     label: 'RGB Only' },
                            { value: 'thermal', label: 'Thermal Only' },
                            { value: 'both',    label: 'RGB + Thermal' },
                        ]} />
                        {sharedNote}
                    </div>
                );
            case 'wind':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input label="Turbine Count" name="scope_turbine_count" type="number" value={formData.scope_turbine_count} onChange={handleChange} placeholder="e.g. 40" />
                        <Input label="Hub Height (m)" name="scope_hub_height_m" type="number" value={formData.scope_hub_height_m} onChange={handleChange} placeholder="e.g. 120" />
                        <ToggleGroup label="Inspection Type" name="scope_inspection_type" value={formData.scope_inspection_type} onChange={handleChange} options={[
                            { value: 'visual',  label: 'Visual' },
                            { value: 'thermal', label: 'Thermal' },
                            { value: 'both',    label: 'Visual + Thermal' },
                        ]} />
                        <div />
                        {sharedNote}
                    </div>
                );
            case 'td_lines':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input label="Line Length (km)" name="scope_line_length_km" type="number" value={formData.scope_line_length_km} onChange={handleChange} placeholder="e.g. 250" />
                        <Input label="Voltage Level (kV)" name="scope_voltage_kv" type="number" value={formData.scope_voltage_kv} onChange={handleChange} placeholder="e.g. 220" />
                        <Input label="Tower Count" name="scope_tower_count" type="number" value={formData.scope_tower_count} onChange={handleChange} placeholder="e.g. 680" />
                        <ToggleGroup label="Terrain Classification" name="scope_terrain_type" value={formData.scope_terrain_type} onChange={handleChange} options={[
                            { value: 'flat',  label: 'Flat / Open' },
                            { value: 'hilly', label: 'Hilly / Forest' },
                            { value: 'urban', label: 'Urban' },
                        ]} />
                        {sharedNote}
                    </div>
                );
            case 'tower':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input label="Tower Count" name="scope_tower_count" type="number" value={formData.scope_tower_count} onChange={handleChange} placeholder="e.g. 12" />
                        <ToggleGroup label="Tower Type" name="scope_tower_type" value={formData.scope_tower_type} onChange={handleChange} options={[
                            { value: 'lattice',  label: 'Lattice' },
                            { value: 'monopole', label: 'Monopole' },
                            { value: 'guyed',    label: 'Guyed' },
                        ]} />
                        <Input label="Min Height (m)" name="scope_height_min_m" type="number" value={formData.scope_height_min_m} onChange={handleChange} placeholder="e.g. 40" />
                        <Input label="Max Height (m)" name="scope_height_max_m" type="number" value={formData.scope_height_max_m} onChange={handleChange} placeholder="e.g. 120" />
                        {sharedNote}
                    </div>
                );
            case 'pipeline':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input label="Pipeline Length (km)" name="scope_pipe_length_km" type="number" value={formData.scope_pipe_length_km} onChange={handleChange} placeholder="e.g. 80" />
                        <Input label="Pipe Diameter (mm)" name="scope_diameter_mm" type="number" value={formData.scope_diameter_mm} onChange={handleChange} placeholder="e.g. 600" />
                        <ToggleGroup label="Terrain" name="scope_terrain_type" value={formData.scope_terrain_type} onChange={handleChange} options={[
                            { value: 'flat',    label: 'Flat' },
                            { value: 'hilly',   label: 'Hilly' },
                            { value: 'coastal', label: 'Coastal' },
                        ]} />
                        <div />
                        {sharedNote}
                    </div>
                );
            case 'volumetric':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input label="Survey Area (Hectares)" name="scope_area_hectares" type="number" value={formData.scope_area_hectares} onChange={handleChange} placeholder="e.g. 15" />
                        <Input label="Stockpile Count" name="scope_stockpile_count" type="number" value={formData.scope_stockpile_count} onChange={handleChange} placeholder="e.g. 24" />
                        {sharedNote}
                    </div>
                );
            default:
                return (
                    <div className="grid grid-cols-1 gap-6">
                        <Input label="Technical Summary" name="description" value={formData.description} onChange={handleChange} placeholder="Brief scope summary..." />
                        {sharedNote}
                    </div>
                );
        }
    };

    // ─── Step Renderers ──────────────────────────────────────────────────────
    const renderStepContent = () => {
        switch (currentStep) {
            case 1:
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
                        <Input label="Project Name" name="name" value={formData.name} onChange={handleChange} error={fieldErrors.name} required placeholder="e.g. Gujarat Solar Survey 2026" />
                        <ClientSelect
                            value={formData.client_id}
                            clientName={formData.client_name}
                            required
                            error={fieldErrors.client_name}
                            onChange={({ client_id, client_name, client }) => {
                                setFormData(prev => ({
                                    ...prev,
                                    client_id,
                                    client_name,
                                    // Picking a client means "use this client's contacts" — mirror them
                                    // onto the project, including clearing them when the client has none,
                                    // so a previously-picked client's details never linger.
                                    ...(client && {
                                        contact_number: client.contact_number || '',
                                        contact_email:  client.contact_email  || '',
                                    }),
                                }));
                                setFieldErrors(fe => (fe.client_name ? { ...fe, client_name: undefined } : fe));
                            }}
                        />
                        <div>
                            <label className={LBL}>Project Service Line</label>
                            <select name="project_type" value={formData.project_type} onChange={handleChange} className={SEL}>
                                {projectTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={LBL}>Drone Flying Zone</label>
                            <select name="drone_flying_zone" value={formData.drone_flying_zone || ''} onChange={handleChange} className={SEL}>
                                <option value="">Select Drone Flying Zone...</option>
                                <option value="Green Zone">Green Zone</option>
                                <option value="Yellow Zone">Yellow Zone</option>
                                <option value="Red Zone">Red Zone</option>
                            </select>
                        </div>
                        <Input label="Project Value (₹)" name="project_value" type="number" value={formData.project_value} onChange={handleChange} placeholder="e.g. 1500000" />
                        <Input label="PO Number" name="po_number" value={formData.po_number} onChange={handleChange} placeholder="e.g. PO-2026-0042" />
                        <Input label="Work Order Number" name="work_order_number" value={formData.work_order_number} onChange={handleChange} placeholder="e.g. WO-GJ-0021" />
                        <Input label="Primary Contact Person" name="contact_person" value={formData.contact_person} onChange={handleChange} placeholder="e.g. Ramesh Patel" />
                        <Input label="Contact Number" name="contact_number" type="tel" value={formData.contact_number} onChange={handleChange} placeholder="e.g. +91 98765 43210" />
                        <Input label="Contact Email" name="contact_email" type="email" value={formData.contact_email} onChange={handleChange} placeholder="e.g. ramesh@ntpc.co.in" />
                    </div>
                );

            case 2:
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
                        <div>
                            <label className={LBL}>State <span className="text-red-400">*</span></label>
                            <select name="state" value={formData.state} onChange={handleChange} className={SEL}>
                                <option value="">Select state…</option>
                                {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {fieldErrors.state && <p className="text-xs text-red-600 mt-1">{fieldErrors.state}</p>}
                        </div>
                        <Input label="District" name="district" value={formData.district} onChange={handleChange} placeholder="e.g. Surat" />
                        <Input label="Location / Site Name" name="location_name" value={formData.location_name} onChange={handleChange} placeholder="e.g. Adani Mundra Solar Park" />
                        <div className="grid grid-cols-2 gap-2">
                            <Input label="Latitude" name="latitude" type="text" placeholder="e.g. 21.7645, 72.1519" value={formData.latitude} onChange={handleChange} error={fieldErrors.latitude} required />
                            <Input label="Longitude" name="longitude" type="text" placeholder="e.g. 72.1519" value={formData.longitude} onChange={handleChange} error={fieldErrors.longitude} required />
                        </div>
                        <Input label="Start Date" name="start_date" type="date" value={formData.start_date} onChange={handleChange} error={fieldErrors.start_date} required />
                        <Input label="End Date" name="end_date" type="date" value={formData.end_date} onChange={handleChange} error={fieldErrors.end_date} required />
                    </div>
                );

            case 3: {
                const typeLabels = {
                    solar_pv: 'Solar PV', wind: 'Wind', td_lines: 'T&D Lines',
                    tower: 'Tower', pipeline: 'Pipeline', volumetric: 'Volumetric', other: 'General',
                };
                return (
                    <div className="p-4 space-y-6">
                        <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
                            <span className="material-symbols-outlined text-primary">rule</span>
                            <div>
                                <p className={LBL + ' mb-0'}>Service Type</p>
                                <p className="text-slate-900 font-bold text-sm">{typeLabels[formData.project_type] || formData.project_type} Scope Definition</p>
                            </div>
                        </div>
                        {renderScopeFields()}
                    </div>
                );
            }

            case 4:
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
                        <div>
                            <label className={LBL}>Primary Deployment Pilot</label>
                            <select name="pilot_id" value={formData.pilot_id} onChange={handleChange} className={SEL}>
                                <option value="">Select Personnel</option>
                                {pilots.map(p => <option key={p.id} value={p.id}>{p.name} ({p.status})</option>)}
                            </select>
                            {pilotWarning ? (
                                <p className="text-[10px] text-amber-500 mt-2 bg-amber-500/10 border border-amber-500/20 p-2 rounded flex items-center gap-2 font-bold">
                                    <span className="material-symbols-outlined text-xs">warning</span> {pilotWarning}
                                </p>
                            ) : formData.pilot_id && (
                                <p className="text-[9px] text-green-500 mt-1 uppercase font-bold tracking-tighter">No conflicts detected</p>
                            )}
                        </div>
                        <div>
                            <label className={LBL}>Primary Drone Unit</label>
                            <select name="drone_id" value={formData.drone_id} onChange={handleChange} className={SEL}>
                                <option value="">Select Equipment</option>
                                {drones.map(d => <option key={d.id} value={d.id}>{d.name || d.serial_number} — {d.model} ({d.status})</option>)}
                            </select>
                            {droneWarning ? (
                                <p className="text-[10px] text-amber-500 mt-2 bg-amber-500/10 border border-amber-500/20 p-2 rounded flex items-center gap-2 font-bold">
                                    <span className="material-symbols-outlined text-xs">warning</span> {droneWarning}
                                </p>
                            ) : formData.drone_id && (
                                <p className="text-[9px] text-green-500 mt-1 uppercase font-bold tracking-tighter">No conflicts detected</p>
                            )}
                        </div>
                        <div>
                            <label className={LBL}>Secondary Deployment Pilot <span className="text-slate-400 normal-case font-normal">(optional)</span></label>
                            <select name="secondary_pilot_id" value={formData.secondary_pilot_id} onChange={handleChange} className={SEL}>
                                <option value="">None</option>
                                {pilots.filter(p => p.id !== formData.pilot_id).map(p => <option key={p.id} value={p.id}>{p.name} ({p.status})</option>)}
                            </select>
                            {secPilotWarning ? (
                                <p className="text-[10px] text-amber-500 mt-2 bg-amber-500/10 border border-amber-500/20 p-2 rounded flex items-center gap-2 font-bold">
                                    <span className="material-symbols-outlined text-xs">warning</span> {secPilotWarning}
                                </p>
                            ) : formData.secondary_pilot_id && (
                                <p className="text-[9px] text-blue-400 mt-1 uppercase font-bold tracking-tighter">Availability check: Active</p>
                            )}
                        </div>
                        <div>
                            <label className={LBL}>Secondary Drone Unit <span className="text-slate-400 normal-case font-normal">(optional)</span></label>
                            <select name="secondary_drone_id" value={formData.secondary_drone_id} onChange={handleChange} className={SEL}>
                                <option value="">None</option>
                                {drones.filter(d => d.id !== formData.drone_id).map(d => <option key={d.id} value={d.id}>{d.name || d.serial_number} — {d.model} ({d.status})</option>)}
                            </select>
                        </div>
                        {fetchingResources && <div className="col-span-2 text-center text-xs text-slate-500 italic">Synchronizing inventory...</div>}
                    </div>
                );

            case 5:
                return (
                    <div className="space-y-6 p-4">
                        <div className="border-2 border-dashed border-slate-200 rounded-xl p-10 flex flex-col items-center justify-center bg-slate-50 group hover:border-primary/50 transition-all cursor-pointer relative">
                            <span className="material-symbols-outlined text-5xl text-slate-400 group-hover:text-primary transition-colors mb-4 italic">map</span>
                            <p className="text-sm text-slate-900 font-bold mb-1">{kmlFile ? kmlFile.name : 'Upload KML Boundary'}</p>
                            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-[0.2em]">{kmlFile ? 'Ready to upload' : 'Drag and drop or click to browse'}</p>
                            <input type="file" accept=".kml,.kmz" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => {
                                if (e.target.files[0]) { setKmlFile(e.target.files[0]); showToast("KML boundary attached"); }
                            }} />
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Project Collaterals</p>
                                <label className="text-xs text-blue-400 cursor-pointer hover:underline">
                                    + Add Document
                                    <input type="file" multiple className="hidden" onChange={(e) => {
                                        if (e.target.files.length) {
                                            setDocumentFiles(prev => [...prev, ...Array.from(e.target.files)]);
                                            showToast(`${e.target.files.length} document(s) attached`);
                                        }
                                    }} />
                                </label>
                            </div>
                            {documentFiles.length === 0 && <p className="text-xs text-slate-400 italic">No collateral documents attached.</p>}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {documentFiles.map((file, idx) => (
                                    <div key={file.name + file.size} className="bg-surface p-4 rounded-lg flex items-center justify-between border border-slate-200/70">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <span className="material-symbols-outlined text-blue-400 shrink-0">description</span>
                                            <p className="text-xs text-slate-900 truncate">{file.name}</p>
                                        </div>
                                        <button type="button" onClick={() => setDocumentFiles(prev => prev.filter((_, i) => i !== idx))} className="material-symbols-outlined text-slate-500 text-sm hover:text-red-400 cursor-pointer shrink-0">close</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );

            case 6: {
                const scopeRows = (SCOPE_SUMMARY_LABELS[formData.project_type] || (() => []))(formData).filter(r => r.v);
                return (
                    <div className="p-4 space-y-4">
                        <div className="bg-surface rounded-xl p-6 border border-primary/20">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-xl font-bold text-slate-900">{formData.name || 'Untitled Protocol'}</h3>
                                    <p className="text-xs text-primary font-bold uppercase tracking-widest">{formData.project_type}</p>
                                </div>
                                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] bg-blue-500/20 text-blue-400">
                                    {formData.status}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
                                <div>
                                    <p className="text-[9px] uppercase tracking-widest text-slate-500 font-black mb-1">Timeline</p>
                                    <p className="text-sm text-slate-900">{formData.start_date || 'N/A'} — {formData.end_date || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase tracking-widest text-slate-500 font-black mb-1">Geography</p>
                                    <p className="text-sm text-slate-900">{formData.state}{formData.district ? `, ${formData.district}` : ''}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase tracking-widest text-slate-500 font-black mb-1">Drone Flying Zone</p>
                                    <p className="text-sm text-slate-900 font-semibold">{formData.drone_flying_zone || 'Not Specified'}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase tracking-widest text-slate-500 font-black mb-1">Assets</p>
                                    <p className="text-xs text-slate-500">
                                        <span className="text-slate-400 font-bold uppercase text-[8px]">Primary</span><br/>
                                        Pilot: {pilots.find(p => p.id === formData.pilot_id)?.name || 'Unassigned'}<br/>
                                        Drone: {drones.find(d => d.id === formData.drone_id)?.serial_number || 'Unassigned'}
                                        {(formData.secondary_pilot_id || formData.secondary_drone_id) && (<>
                                            <br/><span className="text-slate-400 font-bold uppercase text-[8px]">Secondary</span><br/>
                                            {formData.secondary_pilot_id && <>Pilot: {pilots.find(p => p.id === formData.secondary_pilot_id)?.name}<br/></>}
                                            {formData.secondary_drone_id && <>Drone: {drones.find(d => d.id === formData.secondary_drone_id)?.serial_number}</>}
                                        </>)}
                                    </p>
                                </div>
                                {scopeRows.length > 0 && (
                                    <div className="md:col-span-3 pt-4 border-t border-slate-200">
                                        <p className="text-[9px] uppercase tracking-widest text-slate-500 font-black mb-3">Scope Parameters</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                            {scopeRows.map(({ l, v }) => (
                                                <div key={l}>
                                                    <p className="text-[8px] uppercase text-slate-400 font-bold tracking-wider mb-0.5">{l}</p>
                                                    <p className="text-xs text-slate-900 font-bold">{v}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Operational Status Update</label>
                            <div className="flex flex-wrap gap-2">
                                {['initiate', 'planned', 'on_going', 'executed'].map(s => (
                                    <button key={s} type="button" onClick={() => setFormData(f => ({ ...f, status: s }))}
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all border ${formData.status === s ? 'bg-primary text-on-primary border-primary' : 'bg-transparent text-slate-500 border-slate-200'}`}>
                                        {s.replace('_', ' ')}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">Complete &amp; Cancel are handled later from the project page (invoice / reason required).</p>
                        </div>
                    </div>
                );
            }

            default: return null;
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-700 pb-20">
            <PageHeader
                eyebrow="Project Setup"
                title={id && id !== 'new' ? 'Edit Project' : 'New Project'}
                description="Complete each step to configure the project, scope and resources."
            />

            <div className="hidden md:flex justify-between px-4 relative">
                <div className="absolute top-1/2 left-0 w-full h-px bg-slate-300/30 -z-10"></div>
                {STEPS.map((s) => (
                    <button
                        type="button"
                        key={s.id}
                        onClick={() => goToStep(s.id)}
                        aria-current={currentStep === s.id ? 'step' : undefined}
                        title={`Go to ${s.name}`}
                        className="flex flex-col items-center gap-2 group cursor-pointer focus:outline-none bg-transparent"
                    >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all group-hover:scale-110 ${
                            currentStep === s.id ? 'bg-primary text-on-primary scale-110 shadow-glow' :
                            currentStep > s.id  ? 'bg-emerald-500 text-white' : 'bg-surface text-slate-500 border border-slate-200 group-hover:border-primary/60'
                        }`}>
                            <span className="material-symbols-outlined text-sm">{currentStep > s.id ? 'check' : s.icon}</span>
                        </div>
                        <p className={`text-[8px] uppercase tracking-[0.2em] font-black transition-colors ${currentStep === s.id ? 'text-slate-900' : 'text-slate-500 group-hover:text-slate-700'}`}>{s.name}</p>
                    </button>
                ))}
            </div>

            <Card className="p-0 overflow-hidden border border-slate-200 shadow-card">
                <div className="bg-surface px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Step {currentStep}: {STEPS[currentStep - 1].name}</p>
                    {id && id !== 'new' && <span className="text-[10px] text-amber-400 font-bold uppercase tracking-tighter">Live Database Sync Active</span>}
                </div>

                <div className="min-h-[400px]">
                    {renderStepContent()}
                </div>
            </Card>

            {/* Sticky action bar — stays pinned to the bottom so Save is reachable
                from any step. When editing an existing project the Save button is
                always available (not just on the last step). */}
            <UnsavedChangesModal blocker={blocker} />
            <div className="sticky bottom-4 z-30">
                <div className="bg-surface/95 backdrop-blur p-4 rounded-xl border border-slate-200 shadow-pop flex justify-between items-center">
                    <Button variant="ghost" icon="close" onClick={async () => {
                        if (isDirty && !(await confirmDialog({ message: 'You have unsaved changes in this project. Are you sure you want to exit without saving?', danger: true }))) return;
                        navigate(id && id !== 'new' ? `/projects/${id}` : '/projects');
                    }}>Cancel</Button>
                    <div className="flex gap-3">
                        {currentStep > 1 && (
                            <Button variant="secondary" onClick={prevStep} icon="arrow_back">Previous</Button>
                        )}
                        {currentStep < STEPS.length && (
                            <Button onClick={nextStep} icon="arrow_forward" variant={id && id !== 'new' ? 'secondary' : 'primary'}>Next</Button>
                        )}
                        {(currentStep === STEPS.length || (id && id !== 'new')) && (
                            <Button onClick={handleSubmit} disabled={loading} icon="check">
                                {loading ? 'Saving…' : (id && id !== 'new' ? 'Save Changes' : 'Create Project')}
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            <p className="text-center text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em]">
                {id && id !== 'new' ? 'Modifying existing mission record' : 'Auto-save buffer active: 30s frequency'}
            </p>
        </div>
    );
};

export default ProjectForm;
