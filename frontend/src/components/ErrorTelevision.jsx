import './ErrorTelevision.css';

export default function ErrorTelevision({ code, label, Icon, className = '' }) {
  return (
    <div className={`error-illustration error-tv-illustration ${className}`} aria-hidden="true">
      <div className="error-tv-aerial">
        <span />
        <span />
      </div>
      <div className="error-tv-cabinet">
        <div className="error-tv-screen-frame">
          <div className="error-tv-screen">
            <div className="error-tv-color-bars" />
            <div className="error-tv-screen-content">
              <span className="error-tv-brand">TRANSLINK-AFRICA</span>
              <Icon className="error-tv-status-icon" size={30} strokeWidth={1.7} />
              <strong>{code}</strong>
              <span className="error-tv-status-label">{label}</span>
            </div>
          </div>
        </div>
        <div className="error-tv-panel">
          <span className="error-tv-knob" />
          <span className="error-tv-knob" />
          <div className="error-tv-speaker" aria-hidden="true"><i /><i /><i /></div>
        </div>
      </div>
      <div className="error-tv-feet"><span /><span /></div>
    </div>
  );
}
