/* A meal's serving hours. A hall that publishes its own (BU does) wins over the
   campus-wide default in MEAL_TIMES. Hours are fractional: 10.5 is 10:30am. */
import { MEAL_TIMES } from '../data/mockMenu.js';

export function mealHoursFor(menu, locationId, meal) {
  const own = menu?.locations?.[locationId]?.hours?.[meal];
  return own && own.end > own.start ? { ...MEAL_TIMES[meal], ...own } : MEAL_TIMES[meal];
}

/* 7 as "7am", 10.5 as "10:30am", 12 as "12pm". */
export function formatClock(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const suffix = h >= 12 && h < 24 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${suffix}`;
}

export const formatRange = ({ start, end }) => `${formatClock(start)} – ${formatClock(end)}`;

export function hoursHavePassed({ end }, now = new Date()) {
  return now.getHours() + now.getMinutes() / 60 >= end;
}
