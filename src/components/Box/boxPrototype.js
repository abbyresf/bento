/* The box is a prototype for now. It shows in place of the progress card when this is on: open the app with ?box=1 once (the
 * choice is remembered on this device), or ?box=0 to turn it off. Off for everyone by default.
 *
 * The address is read once, when this file loads, because the router rewrites it (/ becomes /app) before Today renders and
 * the query string would be gone by then. */
let on = false;
try {
  const q = new URLSearchParams(window.location.search).get('box');
  if (q === '1') localStorage.setItem('bento_box_proto', '1');
  if (q === '0') localStorage.removeItem('bento_box_proto');
  on = localStorage.getItem('bento_box_proto') === '1';
} catch { /* storage unavailable: stays off */ }

export const boxPrototypeOn = () => on;
