/** Tiny class-name joiner - avoids pulling in clsx for this simple case. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}