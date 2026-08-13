interface IconProps {
  name: 'play' | 'pause' | 'reset' | 'skip' | 'settings' | 'history' | 'check' | 'compact' | 'expand'
  size?: number
}

export const Icon = ({ name, size = 16 }: IconProps) => {
  const commonProps = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  if (name === 'play') {
    return <svg {...commonProps}><path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" /></svg>
  }

  if (name === 'pause') {
    return <svg {...commonProps}><path d="M8 5v14M16 5v14" strokeWidth="2.4" /></svg>
  }

  if (name === 'reset') {
    return <svg {...commonProps}><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" /><path d="M4 4.5v4.1h4.1" /></svg>
  }

  if (name === 'skip') {
    return <svg {...commonProps}><path d="m6 6 8 6-8 6V6Z" fill="currentColor" stroke="none" /><path d="M17 6v12" strokeWidth="2" /></svg>
  }

  if (name === 'settings') {
    return <svg {...commonProps}><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /><path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3.1 1.3v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3.1-1.3l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1A1.8 1.8 0 0 0 3.3 12H3.1a1.8 1.8 0 0 1 0-3.6h.2a1.8 1.8 0 0 0 1.3-3.1l-.1-.1A1.8 1.8 0 1 1 7 2.7l.1.1a1.8 1.8 0 0 0 3.1-1.3v-.2a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3.1 1.3l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1A1.8 1.8 0 0 0 20.7 8h.2a1.8 1.8 0 0 1 0 3.6h-.2a1.8 1.8 0 0 0-1.3 3.4Z" transform="scale(.88) translate(1.65 1.65)" /></svg>
  }

  if (name === 'history') {
    return <svg {...commonProps}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5l3.2 2" /><path d="M4.2 6.8 3.5 4l2.9.3" /></svg>
  }

  if (name === 'compact') {
    return <svg {...commonProps}><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" /></svg>
  }

  if (name === 'expand') {
    return <svg {...commonProps}><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" /></svg>
  }

  return <svg {...commonProps}><path d="m5 12 4.5 4.5L19 7" /></svg>
}
