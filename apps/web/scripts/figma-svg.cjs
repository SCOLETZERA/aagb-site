/*
 * Gera um SVG por página do site, pronto para ARRASTAR para dentro do Figma.
 *
 * O Figma importa SVG nativamente: caixas viram retângulos, fotos viram imagens,
 * ícones viram vetores e textos viram camadas de texto editáveis, agrupados na
 * mesma hierarquia da página. Também sai um PNG da página inteira para referência.
 *
 * Uso: com o site rodando (npx vite preview --port 4173), execute
 *   NODE_PATH=$(npm root -g) npm run figma -- [url-base] [pasta-de-saída]
 * (usa o Playwright instalado na máquina; a saída padrão é apps/web/figma-export/)
 */
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const BASE = process.argv[2] || 'http://localhost:4173'
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '..', 'figma-export'))

const PAGES = [
  ['01-inicio', '/'],
  ['02-noticias', '/noticias'],
  ['03-noticia', 'first:/noticias/'],
  ['04-projetos', '/projetos'],
  ['05-projeto', 'first:/projetos/'],
  ['06-parceiros', '/parceiros'],
  ['07-parceiro', 'first:/parceiros/'],
  ['08-produtos', '/produtos'],
  ['09-produto', 'first:/produtos/'],
  ['10-servicos', '/servicos'],
  ['11-doacoes', '/doacoes'],
  ['12-feira', '/feira'],
  ['13-transparencia', '/transparencia'],
  ['14-privacidade', '/privacidade'],
]

const VIEWPORTS = [
  ['computador', { width: 1440, height: 900 }],
  ['celular', { width: 390, height: 844 }],
]

/* Roda dentro da página: desenha o DOM como SVG. */
async function toSvg(pageName) {
  const SVGNS = 'http://www.w3.org/2000/svg'
  const FONT_RENAME = { 'Bricolage Grotesque Variable': 'Bricolage Grotesque' }
  const sx = scrollX
  const sy = scrollY
  let uid = 0
  const defs = []

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const n = (v) => Math.round(v * 100) / 100

  // 1. Pseudo-elementos (::before/::after) viram elementos reais, com o mesmo visual.
  const hide = document.createElement('style')
  hide.textContent = '[data-nb]::before{content:none!important}[data-na]::after{content:none!important}'
  for (const el of [...document.body.querySelectorAll('*')]) {
    for (const which of ['::before', '::after']) {
      const cs = getComputedStyle(el, which)
      const content = cs.content
      if (!content || content === 'none' || content === 'normal') continue
      const span = document.createElement('span')
      span.dataset.pseudo = which
      for (const p of cs) span.style.setProperty(p, cs.getPropertyValue(p))
      span.style.setProperty('content', 'normal')
      let text = ''
      if (content.startsWith('"')) text = JSON.parse(content)
      else if (content.startsWith('counter(')) text = String([...el.parentElement.children].indexOf(el) + 1)
      span.textContent = text
      if (which === '::before') {
        el.insertBefore(span, el.firstChild)
        el.dataset.nb = ''
      } else {
        el.appendChild(span)
        el.dataset.na = ''
      }
    }
  }
  document.head.appendChild(hide)

  // 2. Imagens embutidas.
  const cache = new Map()
  function dataUrl(src) {
    if (!src || src.startsWith('data:')) return Promise.resolve(src)
    if (!cache.has(src)) {
      cache.set(
        src,
        fetch(src)
          .then((r) => r.blob())
          .then((b) => new Promise((res) => {
            const fr = new FileReader()
            fr.onload = () => res(fr.result)
            fr.readAsDataURL(b)
          }))
          .catch(() => ''),
      )
    }
    return cache.get(src)
  }

  // 3. Métrica da fonte para achar a linha de base do texto.
  const canvas = document.createElement('canvas').getContext('2d')
  const ascentCache = new Map()
  function ascent(cs) {
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    if (!ascentCache.has(font)) {
      canvas.font = font
      const m = canvas.measureText('Hg')
      ascentCache.set(font, [m.fontBoundingBoxAscent, m.fontBoundingBoxDescent])
    }
    return ascentCache.get(font)
  }

  const visibleColor = (c) => c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c)
  const px = (v) => parseFloat(v) || 0

  function radii(cs, w, h) {
    const r = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map((k) => {
      const v = cs[`border${k}Radius`].split(' ')
      const a = v[0].endsWith('%') ? (px(v[0]) / 100) * w : px(v[0])
      return Math.min(a, w / 2, h / 2)
    })
    return r
  }

  function shapePath(x, y, w, h, r) {
    const [tl, tr, br, bl] = r
    if (tl === tr && tr === br && br === bl) {
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${tl ? ` rx="${n(tl)}"` : ''}`
    }
    const d = `M${n(x + tl)},${n(y)}H${n(x + w - tr)}${tr ? `A${n(tr)},${n(tr)} 0 0 1 ${n(x + w)},${n(y + tr)}` : ''}V${n(y + h - br)}${br ? `A${n(br)},${n(br)} 0 0 1 ${n(x + w - br)},${n(y + h)}` : ''}H${n(x + bl)}${bl ? `A${n(bl)},${n(bl)} 0 0 1 ${n(x)},${n(y + h - bl)}` : ''}V${n(y + tl)}${tl ? `A${n(tl)},${n(tl)} 0 0 1 ${n(x + tl)},${n(y)}` : ''}Z`
    return `<path d="${d}"`
  }

  function gradient(bg, x, y, w, h) {
    const m = /linear-gradient\((.*)\)$/.exec(bg)
    if (!m) return null
    const parts = m[1].split(/,(?![^(]*\))/).map((s) => s.trim())
    let angle = 180
    if (/deg$/.test(parts[0])) angle = parseFloat(parts.shift())
    else if (parts[0].startsWith('to ')) {
      const dir = parts.shift()
      angle = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270 }[dir] ?? 180
    }
    const rad = (angle * Math.PI) / 180
    const dx = Math.sin(rad)
    const dy = -Math.cos(rad)
    const id = `g${++uid}`
    const stops = parts.map((p, i) => {
      const mm = /^(rgba?\([^)]*\)|#[0-9a-f]+|\w+)\s*([\d.]+%)?/i.exec(p)
      const off = mm[2] || `${(i / Math.max(1, parts.length - 1)) * 100}%`
      return `<stop offset="${off}" stop-color="${mm[1]}"/>`
    })
    defs.push(`<linearGradient id="${id}" x1="${n(0.5 - dx / 2)}" y1="${n(0.5 - dy / 2)}" x2="${n(0.5 + dx / 2)}" y2="${n(0.5 + dy / 2)}">${stops.join('')}</linearGradient>`)
    return `url(#${id})`
  }

  function layerName(el) {
    const cls = [...el.classList].map((c) => c.replace(/^_/, '').replace(/_[a-z0-9]{5,}$/i, '').replace(/^_+|_+$/g, '')).filter(Boolean)
    const label = el.getAttribute('aria-label')
    return [el.tagName.toLowerCase(), ...cls].join('.') + (label ? ` "${label}"` : '')
  }

  function fontFamily(cs) {
    let f = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()
    return FONT_RENAME[f] || f
  }

  function textOf(str, cs) {
    if (cs.textTransform === 'uppercase') return str.toUpperCase()
    if (cs.textTransform === 'lowercase') return str.toLowerCase()
    return str
  }

  function textNode(node) {
    const el = node.parentElement
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden') return ''
    const raw = node.textContent
    if (!raw.trim()) return ''
    // Posição de cada palavra para refazer as quebras de linha como no site.
    const words = []
    const re = /\S+/g
    let m
    while ((m = re.exec(raw))) {
      const range = document.createRange()
      range.setStart(node, m.index)
      range.setEnd(node, m.index + m[0].length)
      const rects = [...range.getClientRects()].filter((r) => r.width > 0)
      if (!rects.length) continue
      // Palavra partida em duas linhas: usa o primeiro pedaço.
      words.push({ text: m[0], r: rects[0] })
    }
    if (!words.length) return ''
    const lines = []
    for (const w of words) {
      const last = lines[lines.length - 1]
      if (last && Math.abs(last.top - w.r.top) < 2) {
        last.words.push(w)
      } else lines.push({ top: w.r.top, height: w.r.height, words: [w] })
    }
    const [asc, desc] = ascent(cs)
    const contentH = asc + desc
    const ws = px(cs.wordSpacing)
    const tspans = lines.map((l) => {
      const first = l.words[0].r
      const baseline = first.top + (first.height - contentH) / 2 + asc
      const text = textOf(l.words.map((w) => w.text).join(' '), cs)
      return `<tspan x="${n(first.left + sx)}" y="${n(baseline + sy)}">${esc(text)}</tspan>`
    })
    const attrs = [
      `font-family="${esc(fontFamily(cs))}"`,
      `font-size="${px(cs.fontSize)}"`,
      `font-weight="${cs.fontWeight}"`,
      cs.fontStyle !== 'normal' ? `font-style="${cs.fontStyle}"` : '',
      `fill="${cs.color}"`,
      px(cs.letterSpacing) ? `letter-spacing="${n(px(cs.letterSpacing))}"` : '',
      ws ? `word-spacing="${n(ws)}"` : '',
      `xml:space="preserve"`,
    ].filter(Boolean)
    let out = `<text ${attrs.join(' ')}>${tspans.join('')}</text>`
    // Sublinhado.
    if (cs.textDecorationLine.includes('underline')) {
      const thick = px(cs.textDecorationThickness) || Math.max(1, px(cs.fontSize) / 14)
      for (const l of lines) {
        const a = l.words[0].r
        const b = l.words[l.words.length - 1].r
        const base = a.top + (a.height - contentH) / 2 + asc
        const off = px(cs.textUnderlineOffset) || px(cs.fontSize) * 0.12
        out += `<rect x="${n(a.left + sx)}" y="${n(base + off + sy)}" width="${n(b.right - a.left)}" height="${n(thick)}" fill="${cs.textDecorationColor}"/>`
      }
    }
    return out
  }

  function inlineSvg(el, r) {
    const copy = el.cloneNode(true)
    const color = getComputedStyle(el).color
    const all = [el, ...el.querySelectorAll('*')]
    const copies = [copy, ...copy.querySelectorAll('*')]
    all.forEach((orig, i) => {
      const cs = getComputedStyle(orig)
      const c = copies[i]
      c.removeAttribute('class')
      c.removeAttribute('style')
      for (const p of ['fill', 'stroke']) {
        let v = cs[p]
        if (v === 'currentcolor' || v === 'currentColor') v = color
        c.setAttribute(p, v.startsWith('rgb') || v === 'none' ? v : v)
      }
      if (cs.strokeWidth) c.setAttribute('stroke-width', cs.strokeWidth)
      if (cs.strokeLinecap !== 'butt') c.setAttribute('stroke-linecap', cs.strokeLinecap)
      if (cs.strokeLinejoin !== 'miter') c.setAttribute('stroke-linejoin', cs.strokeLinejoin)
      if (cs.opacity !== '1') c.setAttribute('opacity', cs.opacity)
    })
    copy.setAttribute('x', n(r.left + sx))
    copy.setAttribute('y', n(r.top + sy))
    copy.setAttribute('width', n(r.width))
    copy.setAttribute('height', n(r.height))
    if (!copy.getAttribute('viewBox')) copy.setAttribute('viewBox', `0 0 ${n(r.width)} ${n(r.height)}`)
    copy.removeAttribute('aria-hidden')
    copy.removeAttribute('focusable')
    copy.setAttribute('id', `icone-${++uid}`)
    return new XMLSerializer().serializeToString(copy).replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '')
  }

  function aspect(cs) {
    if (cs.objectFit !== 'cover' && cs.objectFit !== 'contain') return 'none'
    const [ox, oy] = cs.objectPosition.split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) : 50))
    const pick = (v, a) => (v < 34 ? `${a}Min` : v > 66 ? `${a}Max` : `${a}Mid`)
    return `${pick(ox, 'x')}${pick(oy, 'Y')} ${cs.objectFit === 'cover' ? 'slice' : 'meet'}`
  }

  async function draw(el) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' && !el.children.length) return ''
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META)$/.test(el.tagName)) return ''
    const r = el.getBoundingClientRect()
    if (r.bottom + sy <= 0 || r.right + sx <= 0) return ''
    if (r.width <= 1 && r.height <= 1 && (cs.overflow === 'hidden' || cs.clip !== 'auto')) return ''
    if (px(cs.opacity) === 0) return ''

    const x = r.left + sx
    const y = r.top + sy
    const w = r.width
    const h = r.height
    const rad = radii(cs, w, h)
    let body = ''

    // Sombra simples (só a primeira).
    if (cs.boxShadow !== 'none' && w && h) {
      const m = /(rgba?\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/.exec(cs.boxShadow)
      if (m && !cs.boxShadow.includes('inset')) {
        const id = `s${++uid}`
        defs.push(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${m[2]}" dy="${m[3]}" stdDeviation="${n(px(m[4]) / 2)}" flood-color="${m[1]}"/></filter>`)
        body += `${shapePath(x, y, w, h, rad)} fill="${visibleColor(cs.backgroundColor) ? cs.backgroundColor : '#fff'}" filter="url(#${id})"/>`
      }
    }

    if (visibleColor(cs.backgroundColor) && w && h) body += `${shapePath(x, y, w, h, rad)} fill="${cs.backgroundColor}"/>`
    if (cs.backgroundImage && cs.backgroundImage !== 'none' && w && h) {
      const g = gradient(cs.backgroundImage, x, y, w, h)
      if (g) body += `${shapePath(x, y, w, h, rad)} fill="${g}"/>`
      const u = /url\("([^"]+)"\)/.exec(cs.backgroundImage)
      if (u) body += `<image x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="xMidYMid slice" xlink:href="${await dataUrl(u[1])}"/>`
    }

    // Bordas.
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => ({
      w: cs[`border${s}Style`] === 'none' ? 0 : px(cs[`border${s}Width`]),
      c: cs[`border${s}Color`],
    }))
    const uniform = sides.every((s) => s.w === sides[0].w && s.c === sides[0].c)
    if (uniform && sides[0].w && visibleColor(sides[0].c)) {
      const b = sides[0].w
      body += `${shapePath(x + b / 2, y + b / 2, w - b, h - b, rad.map((v) => Math.max(0, v - b / 2)))} fill="none" stroke="${sides[0].c}" stroke-width="${b}"/>`
    } else if (!uniform) {
      const [t, rr, bb, l] = sides
      if (t.w && visibleColor(t.c)) body += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${t.w}" fill="${t.c}"/>`
      if (bb.w && visibleColor(bb.c)) body += `<rect x="${n(x)}" y="${n(y + h - bb.w)}" width="${n(w)}" height="${bb.w}" fill="${bb.c}"/>`
      if (l.w && visibleColor(l.c)) body += `<rect x="${n(x)}" y="${n(y)}" width="${l.w}" height="${n(h)}" fill="${l.c}"/>`
      if (rr.w && visibleColor(rr.c)) body += `<rect x="${n(x + w - rr.w)}" y="${n(y)}" width="${rr.w}" height="${n(h)}" fill="${rr.c}"/>`
    }

    if (el.tagName === 'IMG') {
      const src = await dataUrl(el.currentSrc || el.src)
      if (src) {
        const clip = rad.some(Boolean)
        let clipAttr = ''
        if (clip) {
          const id = `c${++uid}`
          defs.push(`<clipPath id="${id}">${shapePath(x, y, w, h, rad)}/></clipPath>`)
          clipAttr = ` clip-path="url(#${id})"`
        }
        body += `<image x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="${aspect(cs)}" xlink:href="${src}"${clipAttr}/>`
      }
    } else if (el instanceof SVGSVGElement) {
      body += inlineSvg(el, r)
      return `<g id="${esc(layerName(el))}-${++uid}">${body}</g>`
    } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      const text = el.tagName === 'SELECT' ? el.options[el.selectedIndex]?.text : el.value || el.placeholder
      if (text) {
        const [asc, desc] = ascent(cs)
        const isPlaceholder = !el.value && el.tagName !== 'SELECT'
        const color = isPlaceholder ? getComputedStyle(el, '::placeholder').color : cs.color
        const top = el.tagName === 'TEXTAREA' ? y + px(cs.paddingTop) + px(cs.borderTopWidth) : y + (h - asc - desc) / 2
        body += `<text font-family="${esc(fontFamily(cs))}" font-size="${px(cs.fontSize)}" font-weight="${cs.fontWeight}" fill="${color}"><tspan x="${n(x + px(cs.paddingLeft) + px(cs.borderLeftWidth))}" y="${n(top + asc)}">${esc(text)}</tspan></text>`
      }
    }

    // Filhos, na ordem em que são pintados (z-index).
    const kids = [...el.childNodes].map((c, i) => {
      let z = 0
      if (c.nodeType === 1) {
        const ccs = getComputedStyle(c)
        if (ccs.position !== 'static' && ccs.zIndex !== 'auto') z = parseInt(ccs.zIndex, 10)
        else if (ccs.position !== 'static') z = 0.5
      }
      return { c, z, i }
    })
    kids.sort((a, b) => (a.z < 0 || b.z < 0 || a.z !== b.z ? a.z - b.z : a.i - b.i))
    let inner = ''
    for (const { c } of kids) {
      if (c.nodeType === 3) inner += textNode(c)
      else if (c.nodeType === 1 && !(el.tagName === 'IMG')) inner += await draw(c)
    }

    if (inner && cs.overflow !== 'visible' && w && h) {
      const id = `c${++uid}`
      defs.push(`<clipPath id="${id}">${shapePath(x, y, w, h, rad)}/></clipPath>`)
      inner = `<g clip-path="url(#${id})">${inner}</g>`
    }
    const content = body + inner
    if (!content) return ''
    const op = px(cs.opacity) < 1 ? ` opacity="${cs.opacity}"` : ''
    return `<g id="${esc(layerName(el))}-${++uid}"${op}>${content}</g>`
  }

  const W = document.documentElement.scrollWidth
  const H = document.documentElement.scrollHeight
  const pageBg = getComputedStyle(document.body).backgroundColor
  const htmlBg = getComputedStyle(document.documentElement).backgroundColor
  const bg = visibleColor(pageBg) ? pageBg : visibleColor(htmlBg) ? htmlBg : '#ffffff'
  const root = document.getElementById('root') || document.body
  const content = await draw(root)
  return `<svg xmlns="${SVGNS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<title>${esc(pageName)}</title>
<defs>${defs.join('')}</defs>
<g id="${esc(pageName)}"><rect id="fundo" width="${W}" height="${H}" fill="${bg}"/>${content}</g>
</svg>
`
}

async function resolveUrl(page, target) {
  if (!target.startsWith('first:')) return target
  const prefix = target.slice(6)
  await page.goto(BASE + prefix.replace(/\/$/, ''), { waitUntil: 'networkidle' })
  const href = await page.evaluate(
    (p) => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).find((h) => h.startsWith(p) && h.length > p.length),
    prefix,
  )
  if (!href) throw new Error(`nenhum link começando com ${prefix}`)
  return href
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  for (const [vpName, viewport] of VIEWPORTS) {
    const dir = path.join(OUT, vpName)
    fs.mkdirSync(dir, { recursive: true })
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce', colorScheme: 'light' })
    await page.addInitScript(() => {
      try {
        localStorage.setItem('aagb-theme', 'light')
      } catch {
        /* sem armazenamento: tema padrão */
      }
    })
    for (const [name, target] of PAGES) {
      const url = await resolveUrl(page, target)
      await page.goto(BASE + url, { waitUntil: 'networkidle' })
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
      await page.evaluate(async () => {
        for (const img of document.images) img.loading = 'eager'
        await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))))
        await document.fonts.ready
      })
      await page.waitForTimeout(300)
      await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true })
      const svg = await page.evaluate(toSvg, `${name} (${vpName})`)
      fs.writeFileSync(path.join(dir, `${name}.svg`), svg)
      console.log(`${vpName}/${name}  ${url}  ${(svg.length / 1024).toFixed(0)} KB`)
    }
    await page.close()
  }
  await browser.close()
})()
