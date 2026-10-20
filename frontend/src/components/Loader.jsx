import React from 'react';

export default function Loader({ label = 'Connexion en cours...' }) {
  return (
    <div className="loader-overlay" role="status" aria-live="polite" aria-label={label}>
      <div className="translink-loader">
        <div className="truck-wrapper">
          <div className="truck-body">
            <svg viewBox="0 0 198 93" className="truck-svg" aria-hidden="true">
              <path strokeWidth="3" stroke="#121C2D" fill="#FF6A3D" d="M135 22.5H177.264C178.295 22.5 179.22 23.133 179.594 24.0939L192.33 56.8443C192.442 57.1332 192.5 57.4404 192.5 57.7504V89C192.5 90.3807 191.381 91.5 190 91.5H135C133.619 91.5 132.5 90.3807 132.5 89V25C132.5 23.6193 133.619 22.5 135 22.5Z" />
              <path strokeWidth="3" stroke="#121C2D" fill="#7D7C7C" d="M146 33.5H181.741C182.779 33.5 183.709 34.1415 184.078 35.112L190.538 52.112C191.16 53.748 189.951 55.5 188.201 55.5H146C144.619 55.5 143.5 54.3807 143.5 53V36C143.5 34.6193 144.619 33.5 146 33.5Z" />
              <rect strokeWidth="3" stroke="#121C2D" fill="#DFDFDF" rx="2.5" height="90" width="121" y="1.5" x="6.5" />
              <rect strokeWidth="2" stroke="#121C2D" fill="#FFFCAB" rx="1" height="7" width="5" y="63" x="187" />
            </svg>
          </div>
          <div className="truck-tires" aria-hidden="true">
            <svg viewBox="0 0 30 30" className="tire-svg"><circle strokeWidth="3" stroke="#121C2D" fill="#121C2D" r="13.5" cy="15" cx="15" /><circle fill="#DFDFDF" r="7" cy="15" cx="15" /></svg>
            <svg viewBox="0 0 30 30" className="tire-svg"><circle strokeWidth="3" stroke="#121C2D" fill="#121C2D" r="13.5" cy="15" cx="15" /><circle fill="#DFDFDF" r="7" cy="15" cx="15" /></svg>
          </div>
          <div className="loader-road" aria-hidden="true" />
        </div>
        <span className="loader-label">{label}</span>
      </div>
    </div>
  );
}
