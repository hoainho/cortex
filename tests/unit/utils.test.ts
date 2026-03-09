import { cn, generateId, formatTime, truncate } from '../../src/lib/utils'

describe('cn()', () => {
  it('combines class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible')
  })

  it('handles undefined and null', () => {
    expect(cn('a', undefined, null, 'b')).toBe('a b')
  })

  it('returns empty string for no inputs', () => {
    expect(cn()).toBe('')
  })
})

describe('generateId()', () => {
  it('returns a string', () => {
    expect(typeof generateId()).toBe('string')
  })

  it('returns UUID-like format', () => {
    const id = generateId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()))
    expect(ids.size).toBe(50)
  })
})

describe('formatTime()', () => {
  it('returns "Vừa xong" for less than 1 minute ago', () => {
    expect(formatTime(Date.now() - 10000)).toBe('Vừa xong')
  })

  it('returns minutes ago', () => {
    const result = formatTime(Date.now() - 5 * 60000)
    expect(result).toBe('5 phút trước')
  })

  it('returns hours ago', () => {
    const result = formatTime(Date.now() - 2 * 3600000)
    expect(result).toBe('2 giờ trước')
  })

  it('returns days ago', () => {
    const result = formatTime(Date.now() - 3 * 86400000)
    expect(result).toBe('3 ngày trước')
  })

  it('returns formatted date for older than 7 days', () => {
    const result = formatTime(Date.now() - 10 * 86400000)
    // Should be a date string in vi-VN format like "18/02/2026"
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
  })
})

describe('truncate()', () => {
  it('returns short string unchanged', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('truncates long string with ellipsis', () => {
    expect(truncate('hello world this is long', 10)).toBe('hello worl...')
  })

  it('returns exact-length string unchanged', () => {
    expect(truncate('hello', 5)).toBe('hello')
  })

  it('returns empty string unchanged', () => {
    expect(truncate('', 10)).toBe('')
  })
})
