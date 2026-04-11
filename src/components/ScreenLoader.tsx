interface ScreenLoaderProps {
  fullscreen?: boolean
  minHeightClass?: string
  label?: string
}

export default function ScreenLoader({
  fullscreen = false,
  minHeightClass = 'h-[60vh]',
  label = 'Loading',
}: ScreenLoaderProps) {
  const className = fullscreen
    ? 'flex min-h-screen items-center justify-center bg-bg'
    : `flex ${minHeightClass} items-center justify-center`

  return (
    <div className={className} role="status" aria-live="polite" aria-label={label}>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal border-t-transparent" />
    </div>
  )
}
