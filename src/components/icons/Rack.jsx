/* Rack — see Forklift.jsx for the icon contract this family follows. */
export function Rack({ size = 24, strokeWidth = 1.7, absoluteStrokeWidth = false, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth={absoluteStrokeWidth ? (strokeWidth * 24) / size : strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      {...props}
    >
      {/* uprights */}
      <path d="M4 3v18" />
      <path d="M20 3v18" />
      {/* beam levels */}
      <path d="M4 9h16" />
      <path d="M4 15h16" />
      <path d="M4 21h16" />
      {/* one pallet on the top level, so it reads as storage not a table */}
      <path d="M10 5h6v4h-6z" />
    </svg>
  )
}
export default Rack
