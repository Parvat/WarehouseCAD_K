/* DockDoor — see Forklift.jsx for the icon contract this family follows. */
export function DockDoor({ size = 24, strokeWidth = 1.7, absoluteStrokeWidth = false, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth={absoluteStrokeWidth ? (strokeWidth * 24) / size : strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      {...props}
    >
      {/* opening */}
      <path d="M4 21V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v16" />
      {/* roll-up slats */}
      <path d="M7 8h10" />
      <path d="M7 12h10" />
      {/* leveler lip at the threshold */}
      <path d="M3 21h18" />
      <path d="M8 21v-4h8v4" />
    </svg>
  )
}
export default DockDoor
