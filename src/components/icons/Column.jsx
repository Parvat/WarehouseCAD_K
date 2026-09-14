/* Column — see Forklift.jsx for the icon contract this family follows. */
export function Column({ size = 24, strokeWidth = 1.7, absoluteStrokeWidth = false, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeLinecap="round" strokeLinejoin="round"
      strokeWidth={absoluteStrokeWidth ? (strokeWidth * 24) / size : strokeWidth}
      {...props}
    >
      {/* base and cap plates */}
      <path d="M5 3h14" />
      <path d="M5 21h14" />
      {/* shaft */}
      <path d="M9 3v18" />
      <path d="M15 3v18" />
      {/* grid tick, the way a column is called out on a plan */}
      <path d="M12 8v8" />
    </svg>
  )
}
export default Column
