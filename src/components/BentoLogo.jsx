export default function BentoLogo({ size = 56 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 60 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* White background */}
      <rect x="3" y="3" width="54" height="54" rx="14" fill="white" />

      {/* Horizontal divider */}
      <rect x="3" y="36" width="54" height="4" fill="#243b55" />
      {/* Vertical divider (top section only) */}
      <rect x="25" y="3" width="4" height="37" fill="#243b55" />

      {/* Orange circle — top-left */}
      <circle cx="14" cy="19" r="8.5" fill="#f47421" />
      {/* Green block — top-right */}
      <rect x="31" y="5" width="24" height="29" rx="5" fill="#4cae70" />
      {/* Cream block — bottom */}
      <rect x="5" y="42" width="50" height="13" rx="4" fill="#f5e6cf" />

      {/* Border drawn last so it sits on top */}
      <rect x="3" y="3" width="54" height="54" rx="14" stroke="#243b55" strokeWidth="5" />
    </svg>
  );
}
