export default function ShopAssistLogo({ size = 36 }) {
  return (
    <svg width={size} height={Math.round(size * 1.08)} viewBox="0 0 100 108" fill="none" aria-label="ShopAssist logo">
      <defs>
        <clipPath id="sa-bag-clip">
          <path d="M13 40 L87 40 L95 95 L5 95 Z" />
        </clipPath>
      </defs>

      {/* Bag body — dark navy */}
      <path d="M13 40 L87 40 L95 95 L5 95 Z" fill="#1b2384" />
      {/* Bag body — sky-blue right diagonal strip */}
      <path d="M55 40 L87 40 L95 95 Z" fill="#4ab8ea" clipPath="url(#sa-bag-clip)" />

      {/* Purple dome at bottom */}
      <ellipse cx="50" cy="95" rx="29" ry="17" fill="#6c3ae8" />

      {/* Circuit-board traces on dome */}
      <g stroke="#e848f8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <line x1="50" y1="93" x2="50" y2="82" />
        <path d="M50 87 L43 87 L40 82" />
        <path d="M50 87 L57 87 L60 82" />
        <path d="M43 87 L37 87 L34 82" />
        <path d="M57 87 L63 87 L66 82" />
      </g>
      <circle cx="34" cy="81" r="2" fill="#e848f8" />
      <circle cx="40" cy="81" r="2" fill="#e848f8" />
      <circle cx="50" cy="81" r="2" fill="#e848f8" />
      <circle cx="60" cy="81" r="2" fill="#e848f8" />
      <circle cx="66" cy="81" r="2" fill="#e848f8" />

      {/* Left handle — dark navy */}
      <path d="M30 40 Q26 14 39 12 Q52 10 49 40"
            stroke="#1b2384" strokeWidth="9" fill="none" strokeLinecap="round" />
      {/* Right handle — medium purple */}
      <path d="M51 40 Q50 10 63 12 Q76 14 70 40"
            stroke="#7560d4" strokeWidth="9" fill="none" strokeLinecap="round" />

      {/* Handle eyelets */}
      <circle cx="34" cy="40" r="4.5" fill="white" opacity="0.9" />
      <circle cx="66" cy="40" r="4.5" fill="#a08ed4" opacity="0.9" />

      {/* Circular refresh arrow — top right (AI indicator) */}
      <path d="M72 19 Q70 8 80 7 Q90 6 92 18 Q94 30 84 36"
            stroke="#29b6f6" strokeWidth="2.8" strokeLinecap="round" fill="none" />
      <polygon points="72,19 66,26 75,25" fill="#29b6f6" />
    </svg>
  )
}
