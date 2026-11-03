/* The food glyphs for the bento box, drawn like the mascot: thick navy outline, flat fills, round joins. Each is drawn in a
 * 48 by 48 box. They are decoration, so they are hidden from screen readers; the compartment names the meal. */
const NV = '#24384F';
const CREAM = '#FFF6EA';

const art = {
  rice: (
    <>
      <path d="M8 33C8 17 16 12 24 12S40 17 40 33Z" fill={CREAM} />
      <path d="M6 32H42Q41 42 24 43 7 42 6 32Z" fill="#FD8F2A" />
      <g fill={NV} stroke="none"><ellipse cx="18" cy="24" rx="1.5" ry="1" /><ellipse cx="26" cy="19" rx="1.5" ry="1" /><ellipse cx="31" cy="27" rx="1.5" ry="1" /></g>
    </>
  ),
  drumstick: (
    <>
      <path d="M29 7C40 7 45 17 39 25 35 30 28 30 24 25 20 20 21 11 29 7Z" fill="#E5A054" />
      <path d="M26 26L13 38" fill="none" strokeWidth="4" />
      <circle cx="10.5" cy="37" r="3.3" fill={CREAM} /><circle cx="14.5" cy="41" r="3.3" fill={CREAM} />
    </>
  ),
  fish: (
    <>
      <path d="M36 24L45 15V33Z" fill="#E8553A" />
      <path d="M5 24C14 9 31 12 39 24 31 36 14 39 5 24Z" fill="#F4876B" />
      <path d="M19 15Q23 24 19 33" fill="none" />
      <circle cx="12.5" cy="22" r="1.8" fill={NV} stroke="none" />
    </>
  ),
  egg: (
    <>
      <path d="M7 26C5 14 17 8 26 11 36 8 44 16 41 26 40 36 28 41 20 38 12 38 8 33 7 26Z" fill="#FFFDF9" />
      <circle cx="25" cy="24" r="8.5" fill="#FFC53D" />
      <path d="M21 21Q23 18 26 19" fill="none" strokeWidth="1.8" stroke="#FFF6EA" />
    </>
  ),
  tofu: (
    <>
      <path d="M10 21H30V38H10Z" fill="#FFF1CC" />
      <path d="M10 21L18 12H38L30 21Z" fill="#FFF9E8" />
      <path d="M30 21L38 12V29L30 38Z" fill="#F2DFA8" />
    </>
  ),
  broccoli: (
    <>
      <path d="M18 43L21 30H27L30 43Z" fill="#B8DE8E" />
      <circle cx="15" cy="24" r="8" fill="#77BE3D" /><circle cx="33" cy="24" r="8" fill="#77BE3D" />
      <circle cx="24" cy="15" r="9" fill="#77BE3D" /><circle cx="24" cy="26" r="8" fill="#77BE3D" />
    </>
  ),
  leaf: (
    <>
      <path d="M7 38C6 17 21 7 41 7 41 28 30 41 10 40Z" fill="#77BE3D" />
      <path d="M9 38Q22 27 35 13" fill="none" strokeWidth="2.2" />
    </>
  ),
  fruit: (
    <>
      <circle cx="24" cy="24" r="17" fill="#FD8F2A" />
      <circle cx="24" cy="24" r="12.5" fill="#FFD08A" strokeWidth="1.8" />
      <path d="M24 12V36M13.6 18L34.4 30M13.6 30L34.4 18" fill="none" strokeWidth="1.8" />
    </>
  ),
  soup: (
    <>
      <path d="M18 14Q14 10 18 6M29 14Q25 10 29 6" fill="none" />
      <path d="M5 24H43Q42 41 24 42 6 41 5 24Z" fill="#E8553A" />
      <path d="M7 24Q24 17 41 24 24 31 7 24Z" fill="#FFB84D" />
    </>
  ),
  bread: (
    <>
      <path d="M9 41V23Q3 20 5 12 7 6 16 6H32Q41 6 43 12 45 20 39 23V41Z" fill="#F2C078" />
      <path d="M14 37V22Q10 19 11 15 12 11 17 11H31Q36 11 37 15 38 19 34 22V37Z" fill="#FBE3B8" strokeWidth="0" />
    </>
  ),
  pasta: (
    <>
      <path d="M6 28H42Q41 42 24 43 7 42 6 28Z" fill={CREAM} />
      <path d="M10 29Q13 14 19 22 23 12 28 22 33 14 38 29" fill="none" stroke={NV} strokeWidth="7" />
      <path d="M10 29Q13 14 19 22 23 12 28 22 33 14 38 29" fill="none" stroke="#F4C04E" strokeWidth="3.6" />
    </>
  ),
  cookie: (
    <>
      <circle cx="24" cy="24" r="17" fill="#D99A58" />
      <g fill="#6B4226" stroke="none"><circle cx="17" cy="18" r="2.6" /><circle cx="29" cy="16" r="2.4" /><circle cx="31" cy="28" r="2.6" /><circle cx="19" cy="30" r="2.4" /><circle cx="25" cy="23" r="2" /></g>
    </>
  ),
  cup: (
    <>
      <path d="M27 12L31 3" fill="none" stroke="#77BE3D" strokeWidth="3.4" />
      <path d="M11 12H37L34 40Q33 43 30 43H18Q15 43 14 40Z" fill="#FFFDF9" />
      <path d="M13 22H35L33.2 40Q32.6 42 30 42H18Q15.4 42 14.8 40Z" fill="#FD8F2A" strokeWidth="0" />
    </>
  ),
  dairy: (
    <>
      <path d="M10 15H38L35 40Q34 43 31 43H17Q14 43 13 40Z" fill="#FFFDF9" />
      <path d="M7 10H41V16H7Z" fill="#FD8F2A" />
      <path d="M12 25H36L35.3 32H12.7Z" fill="#77BE3D" />
    </>
  ),
  bowl: (
    <>
      <path d="M9 22C9 14 16 11 24 11S39 14 39 22Z" fill={CREAM} />
      <path d="M5 22H43Q42 40 24 41 6 40 5 22Z" fill="#FD8F2A" />
      <circle cx="19" cy="16" r="2.6" fill="#77BE3D" /><circle cx="29" cy="17" r="2.2" fill="#E8553A" />
    </>
  ),
};

export const GLYPH_IDS = Object.keys(art);

export default function Glyph({ id, size = 40, style }) {
  const g = art[id] ?? art.bowl;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" style={style}
      stroke={NV} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round">
      {g}
    </svg>
  );
}
