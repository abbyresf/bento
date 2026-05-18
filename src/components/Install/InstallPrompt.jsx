import './InstallPrompt.css';

const ua = navigator.userAgent;
const isIosDevice = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
const isIOSSafari  = isIosDevice && /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS/.test(ua);
const isIOSChrome  = isIosDevice && /CriOS/.test(ua);
const isIOSOther   = isIosDevice && !isIOSSafari && !isIOSChrome;

export default function InstallPrompt({ deferredPrompt, onInstall, onDismiss, forceIOS }) {
  const iosSafari = forceIOS || isIOSSafari;
  const iosChrome = !forceIOS && isIOSChrome;
  const iosOther  = !forceIOS && isIOSOther;

  const handleInstall = async (e) => {
    e.stopPropagation();
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } catch (_) {}
    }
    onInstall();
  };

  const handleDismiss = (e) => {
    e.stopPropagation();
    onDismiss();
  };

  return (
    <div className="install-overlay" onClick={onDismiss}>
      <div className="install-sheet" onClick={e => e.stopPropagation()}>
        <div className="install-handle" />

        <img src="/logo-cropped.png" alt="Bento" className="install-logo" />
        <h2 className="install-title">Add Bento to your home screen</h2>
        <p className="install-sub">Quick access to your meal plan every day — no browser needed.</p>

        {iosSafari && (
          <div className="install-ios-steps">
            <div className="ios-step">
              <span className="ios-step-num">1</span>
              <div className="ios-step-text">
                Tap the <strong>Share</strong> button
                <svg className="ios-share-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                at the bottom of your screen
              </div>
            </div>
            <div className="ios-step">
              <span className="ios-step-num">2</span>
              <div className="ios-step-text">Tap <strong>Add to Home Screen</strong></div>
            </div>
            <div className="ios-step">
              <span className="ios-step-num">3</span>
              <div className="ios-step-text">Tap <strong>Add</strong></div>
            </div>
            <button className="install-dismiss" onClick={handleDismiss}>Got it</button>
          </div>
        )}

        {(iosChrome || iosOther) && (
          <div className="install-ios-steps">
            <div className="ios-step">
              <span className="ios-step-num">1</span>
              <div className="ios-step-text">
                Tap the <strong>three dots</strong>
                <svg className="ios-share-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
                </svg>
                menu
              </div>
            </div>
            <div className="ios-step">
              <span className="ios-step-num">2</span>
              <div className="ios-step-text">Tap <strong>Add to Home Screen</strong></div>
            </div>
            <div className="ios-step">
              <span className="ios-step-num">3</span>
              <div className="ios-step-text">Tap <strong>Add</strong></div>
            </div>
            <button className="install-dismiss" onClick={handleDismiss}>Got it</button>
          </div>
        )}

        {!iosSafari && !iosChrome && !iosOther && (
          <div className="install-actions">
            <button className="install-btn" onClick={handleInstall}>Add to Home Screen</button>
            <button className="install-dismiss" onClick={handleDismiss}>Maybe later</button>
          </div>
        )}
      </div>
    </div>
  );
}
