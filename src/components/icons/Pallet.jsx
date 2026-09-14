/* Pallet — see Forklift.jsx for the icon contract this family follows. */
export function Pallet({ size = 24, strokeWidth = 1.7, absoluteStrokeWidth = false, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth={absoluteStrokeWidth ? (strokeWidth * 24) / size : strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      {...props}
    >
      {/* load */}
      <path d="M7 4h10v7H7z" />
      {/* deck boards */}
      <path d="M3 14h18" />
      <path d="M3 19h18" />
      {/* stringers */}
      <path d="M5 14v5" />
      <path d="M12 14v5" />
      <path d="M19 14v5" />
    </svg>
  )
}
export default Pallet
