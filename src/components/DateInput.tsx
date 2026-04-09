import { useState, useEffect } from 'react'
import { format, parse, parseISO, isValid } from 'date-fns'

interface DateInputProps {
  value: string
  onChange: (value: string) => void
  max?: string
  required?: boolean
  className?: string
}

export default function DateInput({ value, onChange, max, required, className }: DateInputProps) {
  const [text, setText] = useState(() =>
    value ? format(parseISO(value), 'dd/MM/yyyy') : '',
  )

  useEffect(() => {
    setText(value ? format(parseISO(value), 'dd/MM/yyyy') : '')
  }, [value])

  function handleChange(raw: string) {
    const prev = text
    let cleaned = raw.replace(/[^\d/]/g, '')
    if (cleaned.length > 10) cleaned = cleaned.slice(0, 10)

    // Auto-insert slashes when typing forward
    if (cleaned.length > prev.length) {
      const digits = cleaned.replace(/\//g, '')
      if (digits.length > 4) {
        cleaned = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4, 8)
      } else if (digits.length > 2) {
        cleaned = digits.slice(0, 2) + '/' + digits.slice(2)
      }
    }

    setText(cleaned)

    if (cleaned.length === 10) {
      const parsed = parse(cleaned, 'dd/MM/yyyy', new Date())
      if (isValid(parsed)) {
        const iso = format(parsed, 'yyyy-MM-dd')
        if (!max || iso <= max) onChange(iso)
      }
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      placeholder="dd/mm/yyyy"
      required={required}
      className={className}
    />
  )
}
