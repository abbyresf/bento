import SheetView from './SheetView.jsx';
import { AUDIT_SHEET } from './sheets.js';

/* Who exported what, and who signed in. Only an owner can read it, which the
 * database enforces: for anyone else the sheet comes back empty. */
export default function AuditPage() {
  return (
    <div className="rs-page-fill">
      <header className="rs-pagehead">
        <h1>Audit</h1>
        <p className="rs-sub">Every export and every sign in. Entries cannot be changed or deleted.</p>
      </header>
      <SheetView sheet={AUDIT_SHEET} />
    </div>
  );
}
