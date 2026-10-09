import { clampLevel } from '../../data/badgeBox';
import './BentoBox.css';

/* The bento box at one level, as a small picture (made by scripts/build-badge-thumbs.sh from the
 * real drawing). The badge list and the Insights button use these, so ten full-detail boxes are
 * not drawn live. The big box on the badge panel and the unlock card use BentoBox. */
const FILES = import.meta.glob('../../assets/badges/box-*.png', { eager: true, import: 'default' });
const BY_LEVEL = Object.fromEntries(
  Object.entries(FILES).map(([path, url]) => [Number(/box-(\d+)\.png$/.exec(path)[1]), url]),
);

export default function BentoBoxThumb({ level = 0, size = 52, className = '' }) {
  const lv = clampLevel(level);
  return (
    <img
      src={BY_LEVEL[lv]}
      alt=""
      aria-hidden="true"
      width={size}
      height={Math.round(size * (980 / 940))}
      className={`bb-thumb${className ? ` ${className}` : ''}`}
      draggable="false"
    />
  );
}
