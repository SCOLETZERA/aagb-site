import type { ComponentProps } from 'react'
import { Link } from 'react-router-dom'
import styles from './Button.module.css'

interface Look {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'md' | 'lg'
  fullWidth?: boolean
}

const classes = ({ variant = 'primary', size = 'md', fullWidth }: Look, extra?: string) =>
  [styles.button, styles[variant], size === 'lg' && styles.lg, fullWidth && styles.full, extra].filter(Boolean).join(' ')

export function Button({ variant, size, fullWidth, className, type = 'button', ...rest }: Look & ComponentProps<'button'>) {
  return <button type={type} className={classes({ variant, size, fullWidth }, className)} {...rest} />
}

export function ButtonLink({ variant, size, fullWidth, className, ...rest }: Look & ComponentProps<typeof Link>) {
  return <Link className={classes({ variant, size, fullWidth }, className)} {...rest} />
}
