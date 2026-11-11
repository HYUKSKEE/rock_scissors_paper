import type { ButtonHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

type Variant = 'sky' | 'royal' | 'ghost' | 'danger'
interface Common {
  variant?: Variant
  size?: 'md' | 'sm'
  block?: boolean
}

export function Button({ variant = 'sky', size = 'md', block, className = '', ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" data-variant={variant} data-size={size} data-block={block} className={`btn-candy ${className}`} {...rest} />
}

export function LinkButton({ variant = 'sky', size = 'md', block, className = '', ...rest }: Common & LinkProps) {
  return <Link data-variant={variant} data-size={size} data-block={block} className={`btn-candy no-underline ${className}`} {...rest} />
}
