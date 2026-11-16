import { describe, expect, it } from 'vitest'
import { cleanLinks, richTextToPlain, sanitizeRichText } from './richtext'

describe('sanitizeRichText', () => {
  it('keeps bold, italic, underline, lines and line breaks', () => {
    expect(sanitizeRichText('<div><b>Hook</b> then <i>cut</i> <u>here</u></div><div>line<br>two</div>'))
      .toBe('<div><b>Hook</b> then <i>cut</i> <u>here</u></div><div>line<br>two</div>')
    expect(sanitizeRichText('<strong>a</strong><em>b</em><p>c</p>')).toBe('<b>a</b><i>b</i><div>c</div>')
  })

  it('keeps comment highlights with a valid id only', () => {
    expect(sanitizeRichText('<mark data-c="abc_123" style="x">quote</mark>')).toBe('<mark data-c="abc_123">quote</mark>')
    expect(sanitizeRichText('<mark data-c="bad id">q</mark>')).toBe('q')
    expect(sanitizeRichText('<mark>q</mark>')).toBe('q')
  })

  it('removes anything that could run or load something', () => {
    const attacks = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<b onmouseover="alert(1)">x</b>',
      '<a href="javascript:alert(1)">x</a>',
      '<svg><script>alert(1)</script></svg>',
      '<iframe src="https://evil.example"></iframe>',
      '<scr<script>ipt>alert(1)</script>',
      '<div style="background:url(javascript:alert(1))">x</div>',
      '<mark data-c="x" onclick="alert(1)">x</mark>',
      '<<b>script>alert(1)<</b>/script>',
      '<!-- <script>alert(1)</script> -->',
      '<b title=">" onclick="alert(1)">x</b>',
    ]
    for (const a of attacks) {
      const out = sanitizeRichText(a)
      // No tag other than the allowed ones, and no attribute but data-c.
      expect(out.match(/<\/?([a-z]+)/g)?.every((t) => /^<\/?(b|i|u|br|div|mark)$/.test(t)) ?? true, a).toBe(true)
      // Every real tag is bare, or a highlight with only its id.
      expect(out.match(/<[a-z][^>]*>/gi)?.every((t) => /^<(b|i|u|br|div)>$|^<mark data-c="[A-Za-z0-9_-]+">$/.test(t)) ?? true, a).toBe(true)
    }
  })

  it('escapes stray brackets and closes unclosed tags', () => {
    expect(sanitizeRichText('2 < 3 & 4 > 1')).toBe('2 &lt; 3 &amp; 4 &gt; 1')
    expect(sanitizeRichText('&amp; &lt;b&gt;')).toBe('&amp; &lt;b&gt;')
    expect(sanitizeRichText('<b>open <i>both')).toBe('<b>open <i>both</i></b>')
    expect(sanitizeRichText('stray</b> close')).toBe('stray close')
  })

  it('handles empty and non-text input', () => {
    expect(sanitizeRichText('')).toBe('')
    expect(sanitizeRichText(null)).toBe('')
    expect(sanitizeRichText({ a: 1 })).toBe('')
  })
})

describe('richTextToPlain', () => {
  it('turns lines and breaks into new lines and decodes entities', () => {
    expect(richTextToPlain('<div><b>Hook</b>: stop</div><div>2 &lt; 3 &amp; go</div><div><br></div><div>end<br>now</div>'))
      .toBe('Hook: stop\n2 < 3 & go\n\nend\nnow')
    expect(richTextToPlain('First line<div>Second</div>')).toBe('First line\nSecond')
    expect(richTextToPlain('<mark data-c="a1">quoted</mark> text')).toBe('quoted text')
  })
})

describe('cleanLinks', () => {
  it('keeps web links, adds https and drops the rest', () => {
    expect(cleanLinks(['instagram.com/reel/x', 'https://youtu.be/abc', 'javascript:alert(1)', 'not a link', '', 5]))
      .toEqual(['https://instagram.com/reel/x', 'https://youtu.be/abc'])
    expect(cleanLinks('x')).toEqual([])
  })
})
