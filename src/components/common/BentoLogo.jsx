import { useTheme } from '../../context/ThemeContext';

/* The wordmark is navy on transparent, so on the navy ground it disappears.
   The beige asset carries a cream wordmark and survives there.

   Note: only the WORDMARK is fixed by this swap. The bento-box mark itself is
   still a navy rounded square in both files, so on dark it reads as the orange,
   green and cream shapes floating without their container. Genuinely fixing
   that needs a dark-ground version of the mark, not a second file. */
export default function BentoLogo({ className, alt = 'Bento' }) {
  const { resolved } = useTheme();
  const src = resolved === 'dark' ? '/logo-cropped-beige.png' : '/logo-cropped.png';
  return <img src={src} alt={alt} className={className} />;
}
