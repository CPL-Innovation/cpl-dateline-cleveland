import { staffAsset } from '../lib/router';

// The staff editorial workbench is a self-contained concept sketch (own styles +
// scripts), vendored to public/staff.html. We host it verbatim at the /staff
// route in a full-viewport frame so it stays pixel-faithful to the design; its
// internal "← Patron prototype" link navigates the top window back to discovery.
export function StaffFrame() {
  return (
    <iframe
      title="Dateline Cleveland — Editorial Workbench"
      src={staffAsset}
      style={{ border: 'none', width: '100%', height: '100vh', display: 'block' }}
    />
  );
}
