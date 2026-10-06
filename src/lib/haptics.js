import { Capacitor } from '@capacitor/core';

/* Touch feedback, in the small set of kinds Apple's apps use.
 *
 *   selection  a tick, for moving between things: tabs, toggles, pickers
 *   light      a soft tap, for pressing something small: adding an item
 *   medium     a firmer tap, for a committed action
 *   success    the "done" pattern, for a meal confirmed or a goal reached
 *   warning    for something that needs a second look
 *
 * Native only, and silent everywhere else. The plugin is loaded on first use,
 * not at startup: it is not needed to draw the first screen, and the build's
 * prerender step runs this file in Node, where a plugin import can fail. Every
 * call is safe to make and never throws, because a missing tap must never break
 * the thing someone was doing.
 */
let plugin = null;
let loading = null;

function load() {
  if (plugin) return Promise.resolve(plugin);
  if (!Capacitor.isNativePlatform()) return Promise.resolve(null);
  loading ??= import('@capacitor/haptics')
    .then((m) => { plugin = m; return m; })
    .catch(() => null);
  return loading;
}

async function run(fn) {
  try {
    const m = await load();
    if (m) await fn(m);
  } catch { /* haptics are never worth an error */ }
}

export const haptics = {
  selection: () => run((m) => m.Haptics.selectionChanged()),
  light:     () => run((m) => m.Haptics.impact({ style: m.ImpactStyle.Light })),
  medium:    () => run((m) => m.Haptics.impact({ style: m.ImpactStyle.Medium })),
  success:   () => run((m) => m.Haptics.notification({ type: m.NotificationType.Success })),
  warning:   () => run((m) => m.Haptics.notification({ type: m.NotificationType.Warning })),
};
