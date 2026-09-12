import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, LayersControl } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── SVG icon generators (return HTML strings for Leaflet + dangerouslySetInnerHTML) ───────────────

const svgIcons = {
  solar_pv: (s) => `<svg viewBox='0 0 24 24' width='${s}' height='${s}' xmlns='http://www.w3.org/2000/svg'>
    <rect x='1.5' y='11' width='21' height='11' rx='1.5' fill='#FDE68A' stroke='#D97706' stroke-width='1.5'/>
    <line x1='8.5' y1='11' x2='8.5' y2='22' stroke='#D97706' stroke-width='1'/>
    <line x1='15.5' y1='11' x2='15.5' y2='22' stroke='#D97706' stroke-width='1'/>
    <line x1='1.5' y1='16.5' x2='22.5' y2='16.5' stroke='#D97706' stroke-width='1'/>
    <circle cx='12' cy='5.5' r='3' fill='#FEF08A' stroke='#F59E0B' stroke-width='1.5'/>
    <line x1='12' y1='1' x2='12' y2='2' stroke='#F59E0B' stroke-width='1.5' stroke-linecap='round'/>
    <line x1='15.8' y1='2.2' x2='15.1' y2='2.9' stroke='#F59E0B' stroke-width='1.5' stroke-linecap='round'/>
    <line x1='8.2' y1='2.2' x2='8.9' y2='2.9' stroke='#F59E0B' stroke-width='1.5' stroke-linecap='round'/>
    <line x1='17.5' y1='5.5' x2='16.5' y2='5.5' stroke='#F59E0B' stroke-width='1.5' stroke-linecap='round'/>
    <line x1='6.5' y1='5.5' x2='7.5' y2='5.5' stroke='#F59E0B' stroke-width='1.5' stroke-linecap='round'/>
  </svg>`,

  wind: (s) => `<svg viewBox='0 0 24 24' width='${s}' height='${s}' xmlns='http://www.w3.org/2000/svg'>
    <line x1='12' y1='11' x2='12' y2='23' stroke='#94A3B8' stroke-width='2' stroke-linecap='round'/>
    <ellipse cx='12' cy='6' rx='2.2' ry='5' fill='#BFDBFE' stroke='#3B82F6' stroke-width='1' transform='rotate(0 12 11)'/>
    <ellipse cx='12' cy='6' rx='2.2' ry='5' fill='#BFDBFE' stroke='#3B82F6' stroke-width='1' transform='rotate(120 12 11)'/>
    <ellipse cx='12' cy='6' rx='2.2' ry='5' fill='#BFDBFE' stroke='#3B82F6' stroke-width='1' transform='rotate(240 12 11)'/>
    <circle cx='12' cy='11' r='2.2' fill='#3B82F6' stroke='#1D4ED8' stroke-width='0.8'/>
    <circle cx='12' cy='11' r='1' fill='white'/>
  </svg>`,

  td_lines: (s) => `<svg viewBox='0 0 24 24' width='${s}' height='${s}' xmlns='http://www.w3.org/2000/svg'>
    <line x1='12' y1='3' x2='5.5' y2='23' stroke='#7C3AED' stroke-width='1.8' stroke-linecap='round'/>
    <line x1='12' y1='3' x2='18.5' y2='23' stroke='#7C3AED' stroke-width='1.8' stroke-linecap='round'/>
    <line x1='7.2' y1='12.5' x2='16.8' y2='17' stroke='#7C3AED' stroke-width='1' stroke-linecap='round'/>
    <line x1='16.8' y1='12.5' x2='7.2' y2='17' stroke='#7C3AED' stroke-width='1' stroke-linecap='round'/>
    <line x1='3.5' y1='7' x2='20.5' y2='7' stroke='#7C3AED' stroke-width='2' stroke-linecap='round'/>
    <line x1='5.5' y1='12.5' x2='18.5' y2='12.5' stroke='#7C3AED' stroke-width='1.5' stroke-linecap='round'/>
    <circle cx='3.5' cy='7' r='1.6' fill='#A78BFA'/>
    <circle cx='20.5' cy='7' r='1.6' fill='#A78BFA'/>
    <circle cx='12' cy='3' r='1.6' fill='#A78BFA'/>
    <circle cx='5.5' cy='12.5' r='1.1' fill='#A78BFA'/>
    <circle cx='18.5' cy='12.5' r='1.1' fill='#A78BFA'/>
  </svg>`,

  tower: (s) => `<svg viewBox='0 0 24 24' width='${s}' height='${s}' xmlns='http://www.w3.org/2000/svg'>
    <polygon points='12,2 7.5,23 16.5,23' fill='none' stroke='#10B981' stroke-width='1.8' stroke-linejoin='round'/>
    <line x1='9' y1='10' x2='15' y2='10' stroke='#10B981' stroke-width='1.5' stroke-linecap='round'/>
    <line x1='8.2' y1='16' x2='15.8' y2='16' stroke='#10B981' stroke-width='1.5' stroke-linecap='round'/>
    <path d='M9.5 5.5 Q12 3 14.5 5.5' fill='none' stroke='#34D399' stroke-width='1.6' stroke-linecap='round'/>
    <path d='M7.5 7.5 Q12 2.5 16.5 7.5' fill='none' stroke='#34D399' stroke-width='1.2' stroke-linecap='round'/>
    <circle cx='12' cy='2.2' r='1.5' fill='#10B981'/>
  </svg>`,

  pipeline: (s) => `<svg viewBox='0 0 24 24' width='${s}' height='${s}' xmlns='http://www.w3.org/2000/svg'>
    <rect x='1.5' y='9' width='21' height='7' rx='3.5' fill='#6366F1' stroke='#4338CA' stroke-width='1.2'/>
    <rect x='1.5' y='9' width='21' height='3' rx='3.5' fill='#A5B4FC' opacity='0.5'/>
    <rect x='7' y='7' width='3' height='11' rx='1.5' fill='#4338CA' stroke='#312E81' stroke-width='0.8'/>
    <rect x='14' y='7' width='3' height='11' rx='1.5' fill='#4338CA' stroke='#312E81' stroke-width='0.8'/>
    <circle cx='8.5' cy='12.5' r='1.3' fill='#C7D2FE'/>
    <circle cx='15.5' cy='12.5' r='1.3' fill='#C7D2FE'/>
  </svg>`,

  volumetric: (s) => `<svg viewBox='0 0 24 24' width='${s}' height='${s}' xmlns='http://www.w3.org/2000/svg'>
    <circle cx='12' cy='8' r='5' fill='none' stroke='#F97316' stroke-width='1.8'/>
    <line x1='12' y1='3.5' x2='12' y2='12.5' stroke='#F97316' stroke-width='1.3' stroke-linecap='round'/>
    <line x1='7.5' y1='8' x2='16.5' y2='8' stroke='#F97316' stroke-width='1.3' stroke-linecap='round'/>
    <circle cx='12' cy='8' r='1.8' fill='#F97316'/>
    <rect x='9.5' y='14.5' width='5' height='4' rx='0.8' fill='#FB923C' stroke='#C2410C' stroke-width='1'/>
    <line x1='12' y1='18.5' x2='9' y2='23' stroke='#C2410C' stroke-width='1.5' stroke-linecap='round'/>
    <line x1='12' y1='18.5' x2='15' y2='23' stroke='#C2410C' stroke-width='1.5' stroke-linecap='round'/>
    <line x1='9' y1='23' x2='15' y2='23' stroke='#C2410C' stroke-width='1.5' stroke-linecap='round'/>
  </svg>`,

  other: (s) => `<svg viewBox='0 0 24 24' width='${s}' height='${s}' xmlns='http://www.w3.org/2000/svg'>
    <path d='M12 2a8 8 0 0 1 8 8c0 5.5-8 14-8 14S4 15.5 4 10a8 8 0 0 1 8-8z' fill='#94A3B8' stroke='#64748B' stroke-width='1.2'/>
    <circle cx='12' cy='10' r='3' fill='white'/>
  </svg>`,
};

// Project type metadata (no more emoji)
const TYPE_META = {
  solar_pv:   { color: '#F59E0B', label: 'Solar PV'   },
  wind:        { color: '#3B82F6', label: 'Wind'        },
  td_lines:    { color: '#8B5CF6', label: 'T&D Lines'  },
  tower:       { color: '#10B981', label: 'Tower'       },
  pipeline:    { color: '#6366F1', label: 'Pipeline'    },
  volumetric:  { color: '#F97316', label: 'Volumetric' },
  other:       { color: '#94A3B8', label: 'Other'       },
};

const getIcon = (type) => svgIcons[type] || svgIcons.other;

const makeTypeIcon = (type, size = 36) => {
  const { color = '#6366F1' } = TYPE_META[type] || TYPE_META.other;
  const iconSvgSize = Math.round(size * 0.58);
  const tail = Math.round(size * 0.32);
  return L.divIcon({
    html: `<div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.22));">
      <div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:white;border:2.5px solid ${color};
        display:flex;align-items:center;justify-content:center;
        overflow:hidden;
      ">${getIcon(type)(iconSvgSize)}</div>
      <div style="
        width:0;height:0;
        border-left:${Math.round(tail * 0.65)}px solid transparent;
        border-right:${Math.round(tail * 0.65)}px solid transparent;
        border-top:${tail}px solid ${color};
        margin-top:-1px;
      "></div>
    </div>`,
    className: '',
    iconSize:   [size, size + tail],
    iconAnchor: [size / 2, size + tail],
    popupAnchor:[0, -(size + tail + 4)],
  });
};

const INDIA_BOUNDS = [[6.4, 68.1], [37.6, 97.4]];

const DashboardMap = ({ projects = [] }) => {
  return (
    <div className="h-full w-full relative group rounded-2xl overflow-hidden">
      <style>{`
        .leaflet-container { background: #F8FAFC !important; }
        .leaflet-popup-content-wrapper {
          background: #fff; color: #1E293B;
          border: 1px solid #E2E8F0; border-radius: 14px;
          box-shadow: 0 10px 30px rgba(15,23,42,0.1);
          padding: 0;
        }
        .leaflet-popup-content { margin: 0; }
        .leaflet-popup-tip { background: #fff; }
        .leaflet-control-zoom { border: none !important; }
        .leaflet-control-zoom a {
          background: #fff !important; color: #475569 !important;
          border: 1px solid #E2E8F0 !important;
        }
        .leaflet-control-layers { border-radius: 10px !important; box-shadow: 0 2px 8px rgba(15,23,42,0.08) !important; border: 1px solid #E2E8F0 !important; }
        @media (max-width: 640px) {
          .leaflet-control-layers-toggle { width: 30px !important; height: 30px !important; background-size: 16px 16px !important; }
          .leaflet-control { margin: 8px !important; }
          .leaflet-control-layers-expanded { padding: 6px 8px !important; font-size: 11px !important; }
        }
      `}</style>

      <MapContainer
        bounds={INDIA_BOUNDS}
        boundsOptions={{ padding: [0, 0] }}
        maxBounds={[[5.5, 66.5], [38.5, 98.5]]}
        maxBoundsViscosity={1.0}
        minZoom={4}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <LayersControl position="topleft">
          <LayersControl.BaseLayer checked name="Street Map">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap contributors'
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution='&copy; Esri &copy; Maxar'
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Terrain">
            <TileLayer
              url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenTopoMap'
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={60}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          iconCreateFunction={(cluster) => {
            const count = cluster.getChildCount();
            const size  = count < 10 ? 36 : count < 50 ? 44 : 52;
            return L.divIcon({
              html: `<div style="
                width:${size}px;height:${size}px;
                display:flex;align-items:center;justify-content:center;
                background:rgba(99,102,241,0.92);
                color:#fff;font-weight:800;font-size:13px;
                border-radius:50%;border:3px solid #fff;
                box-shadow:0 4px 12px rgba(99,102,241,0.35);
              ">${count}</div>`,
              className: 'custom-cluster-icon',
              iconSize: [size, size],
            });
          }}
        >
          {projects.filter(p => p.latitude && p.longitude).map(proj => {
            const meta  = TYPE_META[proj.project_type] || TYPE_META.other;
            const iconSvg = getIcon(proj.project_type)(22);
            return (
              <Marker
                key={proj.id}
                position={[Number(proj.latitude), Number(proj.longitude)]}
                icon={makeTypeIcon(proj.project_type, 36)}
              >
                <Popup>
                  <div style={{ padding: '10px 14px', minWidth: '160px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span
                        style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: meta.color + '18', borderRadius: '8px', flexShrink: 0 }}
                        dangerouslySetInnerHTML={{ __html: iconSvg }}
                      />
                      <div>
                        <p style={{ fontWeight: 800, fontSize: '13px', margin: 0, color: '#0F172A' }}>{proj.name}</p>
                        <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: meta.color, fontWeight: 700, margin: 0 }}>
                          {meta.label}
                        </p>
                      </div>
                    </div>
                    {(proj.location_name || proj.state) && (
                      <p style={{ fontSize: '11px', color: '#64748B', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 12 }}>📌</span> {proj.location_name || proj.state}
                      </p>
                    )}
                    <a
                      href={`/projects/${proj.id}`}
                      style={{
                        display: 'block', textAlign: 'center', padding: '5px',
                        background: '#EEF2FF', color: '#4F46E5', borderRadius: '8px',
                        fontSize: '10px', fontWeight: 800, textTransform: 'uppercase',
                        letterSpacing: '0.08em', textDecoration: 'none',
                      }}
                    >
                      Open Project →
                    </a>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>

      {/* Legend overlay */}
      <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-[1000] bg-surface/90 backdrop-blur-md px-2.5 py-2 sm:px-4 sm:py-3 border border-slate-200 rounded-lg sm:rounded-xl shadow-sm pointer-events-none space-y-1.5 sm:space-y-2 max-w-[42vw] sm:max-w-none">
        <div>
          <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Active Sites</p>
          <p className="text-lg sm:text-2xl font-black text-indigo-600 leading-none">
            {projects.filter(p => p.latitude && p.longitude).length}
          </p>
        </div>
        <div className="border-t border-slate-100 pt-1 sm:pt-1.5 space-y-0.5">
          {Object.entries(TYPE_META).map(([key, { label, color }]) => {
            const count = projects.filter(p => p.project_type === key && p.latitude && p.longitude).length;
            if (!count) return null;
            return (
              <div key={key} className="flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-[10px] text-slate-600">
                <span
                  className="leading-none flex-shrink-0"
                  style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  dangerouslySetInnerHTML={{ __html: getIcon(key)(14) }}
                />
                <span className="font-medium truncate">{label}</span>
                <span className="ml-auto font-black text-slate-800">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DashboardMap;
