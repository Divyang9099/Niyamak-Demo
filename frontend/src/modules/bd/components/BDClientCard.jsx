import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clientLogoUrl } from '../api/bd.api';
import { BDInlinePriority } from './BDInlinePriority';
import { BDInlineStatus } from './BDInlineStatus';

const STAGE_THEME = {
  to_be_initiated: {
    start: '#94a3b8',
    end: '#64748b',
  },
  wip: {
    start: '#f59e0b',
    end: '#ea580c',
  },
  closed_onboard: {
    start: '#10b981',
    end: '#059669',
  },
  closed_cancelled: {
    start: '#f43f5e',
    end: '#e11d48',
  },
};

const getSectorSvg = (sectorName, status, clientId) => {
  const norm = String(sectorName || '').toLowerCase().trim();
  const theme = STAGE_THEME[status] || STAGE_THEME.to_be_initiated;
  const gradId = `stageSectorGrad_${clientId || 'def'}`;

  const defs = (
    <defs>
      <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={theme.start} />
        <stop offset="100%" stopColor={theme.end} />
      </linearGradient>
    </defs>
  );

  if (norm.includes('solar')) {
    return (
      <svg viewBox="0 0 100 100" className="w-full h-full select-none">
        {defs}
        <circle cx="50" cy="50" r="46" fill={`url(#${gradId})`} opacity="0.15" />
        <circle cx="50" cy="35" r="16" fill={`url(#${gradId})`} />
        <path d="M25,65 L75,65 L65,80 L35,80 Z" fill={`url(#${gradId})`} opacity="0.8" />
        <path d="M38,65 L46,65 L44,80 L36,80 Z" fill="#ffffff" opacity="0.3" />
        <path d="M54,65 L62,65 L64,80 L56,80 Z" fill="#ffffff" opacity="0.3" />
        <line x1="20" y1="65" x2="80" y2="65" stroke={`url(#${gradId})`} strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  if (norm.includes('windmill') || norm.includes('wind')) {
    return (
      <svg viewBox="0 0 100 100" className="w-full h-full select-none">
        {defs}
        <circle cx="50" cy="50" r="46" fill={`url(#${gradId})`} opacity="0.15" />
        <path d="M48,80 L52,80 L51,45 L49,45 Z" fill={`url(#${gradId})`} />
        <circle cx="50" cy="45" r="4" fill="#ffffff" />
        <path d="M50,45 L50,15 C52,25 48,25 50,45" fill={`url(#${gradId})`} />
        <path d="M50,45 L76,60 C68,55 68,59 50,45" fill={`url(#${gradId})`} />
        <path d="M50,45 L24,60 C32,55 32,59 50,45" fill={`url(#${gradId})`} />
      </svg>
    );
  }
  if (norm.includes('t&l') || norm.includes('transmission') || norm.includes('grid') || norm.includes('logistic')) {
    return (
      <svg viewBox="0 0 100 100" className="w-full h-full select-none">
        {defs}
        <circle cx="50" cy="50" r="46" fill={`url(#${gradId})`} opacity="0.15" />
        <path d="M55,15 L30,55 L48,55 L45,85 L70,45 L52,45 Z" fill={`url(#${gradId})`} />
      </svg>
    );
  }
  if (norm.includes('chimney') || norm.includes('factory') || norm.includes('industr')) {
    return (
      <svg viewBox="0 0 100 100" className="w-full h-full select-none">
        {defs}
        <circle cx="50" cy="50" r="46" fill={`url(#${gradId})`} opacity="0.15" />
        <path d="M20,75 L20,50 L40,65 L40,50 L60,65 L60,40 L70,40 L70,75 Z" fill={`url(#${gradId})`} />
        <rect x="27" y="62" width="6" height="8" rx="1" fill="#ffffff" opacity="0.5" />
        <rect x="47" y="62" width="6" height="8" rx="1" fill="#ffffff" opacity="0.5" />
        <circle cx="65" cy="28" r="4" fill={`url(#${gradId})`} opacity="0.6" />
        <circle cx="68" cy="18" r="6" fill={`url(#${gradId})`} opacity="0.3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full select-none">
      {defs}
      <circle cx="50" cy="50" r="46" fill={`url(#${gradId})`} opacity="0.15" />
      <path d="M30,35 L50,18 L70,35 L70,80 L30,80 Z" fill={`url(#${gradId})`} />
      <path d="M45,80 L55,80 L55,65 L45,65 Z" fill="#ffffff" opacity="0.8" />
      <rect x="38" y="42" width="8" height="8" rx="1" fill="#ffffff" opacity="0.4" />
      <rect x="54" y="42" width="8" height="8" rx="1" fill="#ffffff" opacity="0.4" />
      <rect x="38" y="54" width="8" height="8" rx="1" fill="#ffffff" opacity="0.4" />
      <rect x="54" y="54" width="8" height="8" rx="1" fill="#ffffff" opacity="0.4" />
    </svg>
  );
};

const getSectorBorderSvg = (status, clientId) => {
  const theme = STAGE_THEME[status] || STAGE_THEME.to_be_initiated;
  const gradId = `stageBorder_${clientId || 'def'}`;

  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={theme.start} />
          <stop offset="100%" stopColor={theme.end} />
        </linearGradient>
      </defs>
      <rect
        x="2.5"
        y="2.5"
        width="95"
        height="95"
        rx="20"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="2.5"
      />
    </svg>
  );
};

export const BDClientCard = ({ client: initialClient, sectorKey, onClientChanged }) => {
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);
  const [client, setClient] = useState(initialClient);
  useEffect(() => { setClient(initialClient); }, [initialClient]);

  const handleChanged = (updated) => { setClient(updated); onClientChanged?.(updated); };

  const activeSector = sectorKey || (Array.isArray(client.sectors) ? client.sectors[0] : client.sector) || '';

  const goToDetail = () => navigate(`/bd/clients/${client.id}`);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={goToDetail}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') goToDetail(); }}
      title={client.name}
      className="group flex flex-col items-center gap-2 cursor-pointer transition-all duration-300 hover:scale-105 select-none w-24 text-center pb-2"
    >
      <div className="relative p-1.5 flex items-center justify-center">
        {/* Uniform Solid SVG Border Frame with Stage Color */}
        {getSectorBorderSvg(client.status, client.id)}

        {/* Logo Container */}
        <div className="w-20 h-20 rounded-2xl shrink-0 overflow-hidden bg-surface shadow-soft transition-all duration-300 relative z-0">
          {client.logo_url && !imgError ? (
            // object-contain, never object-cover: client logos are mostly wide
            // wordmarks and cover cropped their left/right edges off. The pad
            // keeps the artwork clear of the rounded corners.
            <img
              src={clientLogoUrl(client.id)}
              onError={() => setImgError(true)}
              className="w-full h-full object-contain p-1.5"
              alt=""
            />
          ) : (
            <div className="w-full h-full">
              {getSectorSvg(activeSector, client.status, client.id)}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-0.5 w-full">
        <div className="flex items-center gap-1.5 justify-center flex-wrap">
          <BDInlinePriority client={client} dot onChanged={handleChanged} />
          <BDInlineStatus client={client} dot onChanged={handleChanged} />
        </div>
      </div>
    </div>
  );
};

export default BDClientCard;
