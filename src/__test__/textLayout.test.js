import { describe, it, expect } from 'vitest'
import { wrapLines, fontSpec, layoutText } from '../utils/textLayout'

/* A deterministic measurer: every character is 10 units wide. Real layout uses
   canvas measureText, but the ALGORITHM is what these tests pin down. */
const measure = s => s.length * 10
const NL = String.fromCharCode(10)

describe('wrapLines', () => {
  it('leaves text alone when no width is set', () => {
    expect(wrapLines('one two three', 0, measure)).toEqual(['one two three'])
    expect(wrapLines('one two three', undefined, measure)).toEqual(['one two three'])
  })

  it('wraps on word boundaries', () => {
    // 'Rack Bay' = 8 chars = 80; adding ' 12' would be 110 > 100
    expect(wrapLines('Rack Bay 12', 100, measure)).toEqual(['Rack Bay', '12'])
  })

  it('always honours explicit newlines', () => {
    expect(wrapLines(`Aisle 4${NL}Level 3`, 0, measure)).toEqual(['Aisle 4', 'Level 3'])
    expect(wrapLines(`a${NL}${NL}b`, 0, measure)).toEqual(['a', '', 'b'])
  })

  it('breaks a word that cannot fit on its own line', () => {
    // one 12-char token at width 50 must split rather than overflow
    const out = wrapLines('ABCDEFGHIJKL', 50, measure)
    expect(out.length).toBeGreaterThan(1)
    out.forEach(l => expect(measure(l)).toBeLessThanOrEqual(50))
  })

  it('never emits a line wider than the frame', () => {
    const text = 'Selective racking bay identification label for aisle four'
    for (const w of [60, 120, 200, 340]) {
      wrapLines(text, w, measure).forEach(l => expect(measure(l)).toBeLessThanOrEqual(w))
    }
  })

  it('narrowing adds lines, widening removes them', () => {
    const text = 'Selective racking bay identification label'
    const narrow = wrapLines(text, 80,  measure).length
    const mid    = wrapLines(text, 200, measure).length
    const wide   = wrapLines(text, 600, measure).length
    expect(narrow).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThanOrEqual(wide)
    expect(wide).toBe(1)
  })

  it('handles empty and undefined input without throwing', () => {
    expect(wrapLines('', 100, measure)).toEqual([''])
    expect(wrapLines(undefined, 100, measure)).toEqual([''])
  })

  it('preserves the words — wrapping must not lose or duplicate text', () => {
    const text = 'Aisle four rack bay twelve level three'
    const joined = wrapLines(text, 90, measure).join(' ').replace(/\s+/g, ' ').trim()
    expect(joined).toBe(text)
  })
})

describe('fontSpec', () => {
  it('builds a CSS shorthand canvas can parse', () => {
    expect(fontSpec({ fontSize: 20, fontFamily: 'Inter' })).toBe('400 20px Inter')
    expect(fontSpec({ bold: true, italic: true, fontSize: 14, fontFamily: 'Montserrat' }))
      .toBe('italic 700 14px Montserrat')
  })
})

describe('layoutText — letter-spacing', () => {
  // No canvas in this test environment, so the real measurer inside layoutText
  // falls back to a fixed length * fontSize * 0.55 — fully deterministic.
  const text = 'Hello there'   // 11 characters
  const size = 20
  const base = text.length * size * 0.55   // = 121, the letterSpacing:0 width

  it('adds text.length * letterSpacing on top of the base measured width', () => {
    const L = layoutText({ text, fontSize: size, letterSpacing: 3 })
    expect(L.width).toBeCloseTo(base + text.length * 3, 5)
  })

  it('letterSpacing:0 (or unset) leaves width unchanged', () => {
    const L0 = layoutText({ text, fontSize: size, letterSpacing: 0 })
    const Lu = layoutText({ text, fontSize: size })
    expect(L0.width).toBeCloseTo(base, 5)
    expect(Lu.width).toBeCloseTo(base, 5)
  })

  it('a wider letterSpacing widens the box further, monotonically', () => {
    const w1 = layoutText({ text, fontSize: size, letterSpacing: 1 }).width
    const w3 = layoutText({ text, fontSize: size, letterSpacing: 3 }).width
    const w6 = layoutText({ text, fontSize: size, letterSpacing: 6 }).width
    expect(w3).toBeGreaterThan(w1)
    expect(w6).toBeGreaterThan(w3)
  })
})
