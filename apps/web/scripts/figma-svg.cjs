/*
 * Gera um SVG por página do site, pronto para ARRASTAR para dentro do Figma.
 *
 * O Figma importa SVG nativamente: caixas viram retângulos, fotos viram imagens,
 * ícones viram vetores e textos viram camadas de texto editáveis, agrupados na
 * mesma hierarquia da página. Também sai um PNG da página inteira para referência.
 *
 * Uso: com o site rodando (npx vite preview --port 4173), execute
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... NODE_PATH=$(npm root -g) npm run figma -- [url-base] [pasta-de-saída]
 * Sem ADMIN_EMAIL/ADMIN_PASSWORD (conta do painel no banco local) as telas do painel ficam de fora.
 * Para o painel aparecer, o site precisa ter sido gerado com VITE_API_URL apontando para a API local.
 * (usa o Playwright instalado na máquina; a saída padrão é apps/web/figma-export/)
 */
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const BASE = process.argv[2] || 'http://localhost:4173'
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '..', 'figma-export'))

// [nome, endereço, ação antes da captura]. Endereço "first:/x/" abre o primeiro item da lista /x.
const SITE = [
  ['Início', '/'],
  ['Notícias', '/noticias'],
  ['Notícia (detalhe)', 'first:/noticias/'],
  ['Projetos', '/projetos'],
  ['Projeto (detalhe)', 'first:/projetos/'],
  ['Parceiros', '/parceiros'],
  ['Parceiro (detalhe)', 'first:/parceiros/'],
  ['Produtos', '/produtos'],
  ['Produto (detalhe)', 'first:/produtos/'],
  ['Carrinho aberto', '/produtos', 'cart'],
  ['Serviços', '/servicos'],
  ['Doações', '/doacoes'],
  ['Feira', '/feira'],
  ['Transparência', '/transparencia'],
  ['Privacidade', '/privacidade'],
  ['Página não encontrada', '/pagina-que-nao-existe'],
  ['Menu aberto', '/', 'menu', 'celular'],
]

const ADMIN = [
  ['Painel - Entrar', '/admin', 'logout'],
  ['Painel - Resumo', '/admin', 'login'],
  ['Painel - Pedidos', '/admin/pedidos'],
  ['Painel - Serviços', '/admin/servicos'],
  ['Painel - Doações recebidas', '/admin/doacoes'],
  ['Painel - Notícias', '/admin/conteudo/news'],
  ['Painel - Editar notícia', '/admin/conteudo/news', 'edit'],
  ['Painel - Projetos', '/admin/conteudo/projects'],
  ['Painel - Parceiros', '/admin/conteudo/partners'],
  ['Painel - Produtos', '/admin/conteudo/products'],
  ['Painel - Serviços oferecidos', '/admin/conteudo/services'],
  ['Painel - Necessidades', '/admin/conteudo/needs'],
  ['Painel - Doações (conteúdo)', '/admin/conteudo/donations'],
  ['Painel - Documentos', '/admin/documentos'],
  ['Painel - Contas', '/admin/contas'],
  ['Painel - Auditoria', '/admin/auditoria'],
]
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

const VIEWPORTS = [
  ['computador', { width: 1440, height: 900 }],
  ['celular', { width: 390, height: 844 }],
]

/* Roda dentro da página: desenha o DOM como SVG. */
async function toSvg({ pageName, viewportOnly }) {
  const SVGNS = 'http://www.w3.org/2000/svg'
  const FONT_RENAME = { 'Bricolage Grotesque Variable': 'Bricolage Grotesque' }
  // Telas com janela aberta mostram só a parte visível: coordenadas relativas à tela.
  const sx = viewportOnly ? 0 : scrollX
  const sy = viewportOnly ? 0 : scrollY
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

  // Fonte que o Figma vai usar. Pilhas de fontes do sistema viram uma fonte do Google Fonts parecida.
  function fontFamily(cs) {
    const stack = cs.fontFamily.split(',').map((f) => f.replace(/["']/g, '').trim())
    if (stack.includes('monospace') || stack.includes('ui-monospace')) return 'Roboto Mono'
    const f = stack[0]
    return FONT_RENAME[f] || f
  }
  const numeric = (cs) => (cs.fontVariantNumeric && cs.fontVariantNumeric !== 'normal' ? ` font-variant-numeric="${cs.fontVariantNumeric}"` : '')

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
      `font-weight="${cs.fontWeight}"${numeric(cs)}`,
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

  // Tamanho e posição de uma imagem de fundo (ex.: a setinha dos campos de seleção).
  function natural(src) {
    return new Promise((res) => {
      const im = new Image()
      im.onload = () => res([im.naturalWidth || 16, im.naturalHeight || 16])
      im.onerror = () => res([16, 16])
      im.src = src
    })
  }
  function lengthIn(v, total, img) {
    // Aceita "12px", "50%", "calc(100% - 12px)", "right 12px" já resolvido pelo navegador.
    v = v.trim()
    const calc = /^calc\((.*)\)$/.exec(v)
    if (calc) {
      return calc[1].split(/\s+(?=[+-]\s)/).reduce((acc, term) => {
        const m = /^([+-])?\s*(-?[\d.]+)(%|px)$/.exec(term.trim())
        if (!m) return acc
        const val = m[3] === '%' ? (parseFloat(m[2]) / 100) * (total - img) : parseFloat(m[2])
        return m[1] === '-' ? acc - val : acc + val
      }, 0)
    }
    if (v.endsWith('%')) return (parseFloat(v) / 100) * (total - img)
    return px(v)
  }
  async function bgBox(cs, src, x, y, w, h) {
    if (cs.backgroundRepeat.startsWith('repeat') && cs.backgroundSize === 'auto') return { x, y, w, h }
    const [nw, nh] = await natural(src)
    let bw = nw
    let bh = nh
    const size = cs.backgroundSize.split(',')[0].trim()
    if (size === 'cover' || size === 'contain') {
      const k = size === 'cover' ? Math.max(w / nw, h / nh) : Math.min(w / nw, h / nh)
      bw = nw * k
      bh = nh * k
    } else if (size !== 'auto') {
      const [a, b = 'auto'] = size.split(/\s+/)
      bw = a === 'auto' ? null : a.endsWith('%') ? (parseFloat(a) / 100) * w : px(a)
      bh = b === 'auto' ? null : b.endsWith('%') ? (parseFloat(b) / 100) * h : px(b)
      if (bw == null && bh == null) [bw, bh] = [nw, nh]
      else if (bw == null) bw = (nw / nh) * bh
      else if (bh == null) bh = (nh / nw) * bw
    }
    const bx = lengthIn(cs.backgroundPositionX.split(',')[0], w, bw)
    const by = lengthIn(cs.backgroundPositionY.split(',')[0], h, bh)
    return { x: x + bx, y: y + by, w: bw, h: bh }
  }

  // Quebra o texto em linhas que cabem na largura, como numa caixa de texto.
  function wrapLines(text, cs, width) {
    canvas.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const out = []
    for (const para of text.split('\n')) {
      let line = ''
      for (const word of para.split(/\s+/)) {
        const tryLine = line ? `${line} ${word}` : word
        if (line && canvas.measureText(tryLine).width > width) {
          out.push(line)
          line = word
        } else line = tryLine
      }
      out.push(line)
    }
    return out
  }

  const modals = []
  async function draw(el, fromTop = false) {
    // Janelas modais (carrinho, edição) ficam por cima de tudo: desenhadas no fim.
    if (!fromTop && el.tagName === 'DIALOG' && el.open && el.matches(':modal')) {
      modals.push(el)
      return ''
    }
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
      if (u) {
        const src = await dataUrl(u[1])
        const box = await bgBox(cs, src, x, y, w, h)
        body += `<image x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" preserveAspectRatio="none" xlink:href="${src}"/>`
      }
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
      let text = el.tagName === 'SELECT' ? el.options[el.selectedIndex]?.text : el.value || el.placeholder
      if (el.type === 'date') {
        text = el.value ? el.value.split('-').reverse().join('/') : 'dd/mm/aaaa'
      }
      if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'file' || el.type === 'hidden') text = ''
      if (el.type === 'password' && el.value) text = '•'.repeat(el.value.length)
      const padL = px(cs.paddingLeft) + px(cs.borderLeftWidth)
      const padR = px(cs.paddingRight) + px(cs.borderRightWidth)
      const padT = px(cs.paddingTop) + px(cs.borderTopWidth)
      const padB = px(cs.paddingBottom) + px(cs.borderBottomWidth)
      const cx = x + padL
      const cw = Math.max(0, w - padL - padR)
      if (text) {
        const [asc, desc] = ascent(cs)
        const isPlaceholder = !el.value && el.tagName !== 'SELECT' && el.type !== 'date'
        const color = isPlaceholder ? getComputedStyle(el, '::placeholder').color : cs.color
        const font = `font-family="${esc(fontFamily(cs))}" font-size="${px(cs.fontSize)}" font-weight="${cs.fontWeight}" fill="${color}"`
        const id = `c${++uid}`
        defs.push(`<clipPath id="${id}"><rect x="${n(cx)}" y="${n(y + padT)}" width="${n(cw)}" height="${n(Math.max(0, h - padT - padB))}"/></clipPath>`)
        let spans
        if (el.tagName === 'TEXTAREA') {
          const lh = cs.lineHeight === 'normal' ? px(cs.fontSize) * 1.2 : px(cs.lineHeight)
          spans = wrapLines(text, cs, cw)
            .map((l, k) => `<tspan x="${n(cx)}" y="${n(y + padT + k * lh + (lh - asc - desc) / 2 + asc)}">${esc(l)}</tspan>`)
            .join('')
        } else {
          spans = `<tspan x="${n(cx)}" y="${n(y + (h - asc - desc) / 2 + asc)}">${esc(text)}</tspan>`
        }
        body += `<text ${font} clip-path="url(#${id})" xml:space="preserve">${spans}</text>`
      }
      if (el.type === 'file') {
        // Campo de arquivo como o Chrome em português mostra.
        const [asc, desc] = ascent(cs)
        const fs2 = px(cs.fontSize)
        canvas.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
        const label = 'Escolher arquivo'
        const bw = canvas.measureText(label).width + 12
        const bh = fs2 + 6
        const by = y + (h - bh) / 2
        const base = y + (h - asc - desc) / 2 + asc
        const fid = `c${++uid}`
        defs.push(`<clipPath id="${fid}"><rect x="${n(x)}" y="${n(y)}" width="${n(w - padR)}" height="${n(h)}"/></clipPath>`)
        body += `<g id="campo de arquivo" clip-path="url(#${fid})">`
        body += `<g id="botão escolher arquivo"><rect x="${n(cx)}" y="${n(by)}" width="${n(bw)}" height="${n(bh)}" rx="2" fill="#efefef" stroke="#767676" stroke-width="1"/><text font-family="${esc(fontFamily(cs))}" font-size="${fs2}" fill="#000000"><tspan x="${n(cx + 6)}" y="${n(base)}">${label}</tspan></text></g>`
        body += `<text font-family="${esc(fontFamily(cs))}" font-size="${fs2}" fill="${cs.color}"><tspan x="${n(cx + bw + 5)}" y="${n(base)}">${el.files?.length ? esc(el.files[0].name) : 'Nenhum arquivo escolhido'}</tspan></text></g>`
      }
      if (el.tagName === 'SELECT' && cs.appearance !== 'none' && cs.backgroundImage === 'none') {
        // Setinha do campo de seleção nativo.
        const ax = x + w - px(cs.borderRightWidth) - 16
        const ay = y + h / 2
        body += `<path id="seta" d="M${n(ax - 4)},${n(ay - 2)}L${n(ax)},${n(ay + 2)}L${n(ax + 4)},${n(ay - 2)}" fill="none" stroke="${cs.color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
      }
      if (el.type === 'date') {
        // Ícone de calendário que o navegador mostra no campo de data.
        const s2 = 14
        const ix = x + w - padR - s2
        const iy = y + (h - s2) / 2
        body += `<g id="ícone calendário" fill="none" stroke="${cs.color}" stroke-width="1.6"><rect x="${n(ix + 1)}" y="${n(iy + 2)}" width="${s2 - 2}" height="${s2 - 3}" rx="1.5"/><path d="M${n(ix + 1)},${n(iy + 6)}H${n(ix + s2 - 1)}M${n(ix + 4.5)},${n(iy)}V${n(iy + 3.5)}M${n(ix + s2 - 4.5)},${n(iy)}V${n(iy + 3.5)}"/></g>`
      }
      if (el.tagName === 'TEXTAREA' && cs.resize !== 'none') {
        const rx2 = x + w - px(cs.borderRightWidth) - 3
        const ry2 = y + h - px(cs.borderBottomWidth) - 3
        body += `<path id="alça de redimensionar" d="M${n(rx2 - 8)},${n(ry2)}L${n(rx2)},${n(ry2 - 8)}M${n(rx2 - 4)},${n(ry2)}L${n(rx2)},${n(ry2 - 4)}" stroke="#888888" stroke-width="1" fill="none"/>`
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

  // Partes da tela com o nome do que cada uma é, para as etiquetas de anotação.
  function findRegions() {
    const out = []
    const vis = (el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return r.width > 40 && r.height > 20 && cs.display !== 'none' && cs.visibility !== 'hidden'
    }
    const clean = (t) => (t || '').replace(/\s+/g, ' ').trim()
    const short = (t, max = 58) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t)
    const add = (el, label) => {
      if (el && vis(el)) out.push({ el, label: short(label) })
    }
    const isCardHead = (h) => h.closest('article, li, dialog, [class*="card" i]')
    const heads = (el) => [...el.querySelectorAll('h1, h2')].filter((h) => (h.tagName === 'H1' || !isCardHead(h)) && vis(h))
    const home = location.pathname === '/'
    const admin = location.pathname.startsWith('/admin')
    const h1Text = clean(document.querySelector('main h1')?.textContent)

    // Com uma janela aberta, só ela é marcada: o resto da tela fica escurecido atrás.
    const openDialog = [...document.querySelectorAll('dialog')].find((d) => d.open)
    if (openDialog) {
      add(openDialog, `Janela: ${clean(openDialog.querySelector('h1, h2, h3')?.textContent || 'aberta')}`)
      const form = openDialog.querySelector('form')
      if (form) add(form, 'Formulário')
      return out
    }
    const header = [...document.querySelectorAll('header')].find((h) => !h.closest('main') && !h.closest('dialog'))
    if (header) add(header, admin ? 'Barra do painel' : 'Cabeçalho e menu')
    const nav = header?.querySelector('nav')
    if (nav && nav.getBoundingClientRect().height > 200) add(nav, 'Menu aberto')
    const side = document.querySelector('nav[aria-label="Painel"]')
    if (side) add(side, 'Menu do painel')

    function label(k) {
      const hs = heads(k)
      const h1 = hs.find((h) => h.tagName === 'H1')
      if (k.matches('h1')) return 'Título da página'
      if (k.matches('h2, h3')) return `Seção: ${clean(k.textContent)}`
      if (k.matches('img')) return 'Logo'
      if (h1) {
        if (home) return 'Destaque principal'
        // Página de detalhe (ex.: /noticias/alguma-coisa): o bloco do título é o conteúdo inteiro.
        const detail = location.pathname.split('/').filter(Boolean).length > 1 && !admin
        return detail && k.getBoundingClientRect().height > 300 ? `Conteúdo: ${clean(h1.textContent)}` : 'Título da página'
      }
      if (/^Nenhum/i.test(clean(k.textContent))) return 'Aviso de lista vazia'
      if (k.querySelector('input[type=search]') && !k.querySelector('article')) return 'Busca'
      const h2 = hs[0]
      if (k.matches('form') || (!h2 && k.querySelector('form'))) return 'Formulário'
      if (h2) return `Seção: ${clean(h2.textContent)}`
      if (k.querySelector('table') || k.matches('table')) return `Tabela: ${h1Text}`
      if (k.matches('a[href]') && clean(k.textContent).length < 30) return 'Link de voltar'
      if (k.matches('ul, ol') || k.querySelectorAll('article, li').length > 1) return h1Text ? `Lista: ${h1Text}` : 'Lista de itens'
      if (k.querySelector('img, svg') && clean(k.textContent).length < 40) return 'Logo e nome'
      if (k.querySelector('img')) return 'Imagem'
      if (k.matches('p')) return 'Texto de apresentação'
      if (/\d/.test(k.textContent) && k.children.length > 1) return 'Números em destaque'
      return k.getAttribute('aria-label') || 'Conteúdo'
    }

    function walk(el) {
      let level = el
      while (level.children.length === 1 && level.firstElementChild) level = level.firstElementChild
      for (const k of [...level.children].filter((c) => vis(c) && c.tagName !== 'DIALOG')) {
        // Bloco com várias seções dentro: separa cada uma.
        const hs = heads(k)
        const n2 = hs.filter((h) => h.tagName === 'H2' && !/^Nenhum/i.test(clean(h.textContent))).length
        const hasH1 = hs.some((h) => h.tagName === 'H1')
        if ((n2 > 1 && !hasH1) || (hasH1 && n2 > 0 && !home && k.children.length > 1)) walk(k)
        else add(k, label(k))
      }
    }
    const main = document.querySelector('main')
    if (main) walk(main)

    const footer = [...document.querySelectorAll('footer')].find((f) => !f.closest('main'))
    if (footer) add(footer, 'Rodapé')
    const dialog = [...document.querySelectorAll('dialog')].find((d) => d.open)
    if (dialog) add(dialog, `Janela: ${clean(dialog.querySelector('h1, h2, h3')?.textContent || 'aberta')}`)
    return out
  }

  // Etiquetas em cima de cada parte da tela, numa camada própria ("Anotações") que dá para esconder.
  function annotations(W) {
    const ANN = '#7b3fe4'
    const small = W < 600
    const fsz = small ? 13 : 15
    const ph = small ? 24 : 28
    canvas.font = `700 ${fsz}px "Atkinson Hyperlegible Next", sans-serif`
    let outA = ''
    const regions = findRegions()
      .map(({ el, label }) => {
        const r = el.getBoundingClientRect()
        return { el, label, x: r.left + sx, y: r.top + sy, w: r.width, h: r.height, r }
      })
      .filter((g) => !(viewportOnly && (g.r.bottom <= 0 || g.r.top >= innerHeight)))
    const placed = []
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    const contains = (a, b) => a.x <= b.x + 1 && a.y <= b.y + 1 && a.x + a.w >= b.x + b.w - 1 && a.y + a.h >= b.y + b.h - 1
    for (const g of regions) {
      const pw = canvas.measureText(g.label).width + 20
      // Lugares possíveis, na ordem de preferência: em cima, ao lado direito, dentro no canto.
      const cands = [
        { x: g.x, y: g.y - ph - 4 },
        { x: g.x + g.w + 10, y: g.y + Math.min(4, Math.max(0, (g.h - ph) / 2)) },
        // Dentro: no canto direito (o texto costuma estar à esquerda). Na barra do topo, à esquerda.
        ...(g.y < 4
          ? [{ x: g.x + 6, y: g.y + 4 }, { x: g.x + g.w - pw - 6, y: g.y + 4 }]
          : [{ x: g.x + g.w - pw - 6, y: g.y + 4 }, { x: g.x + 6, y: g.y + 4 }]),
      ].map((c, i) => ({ x: i === 1 ? c.x : Math.max(4, Math.min(c.x, W - pw - 4)), y: c.y, w: pw, h: ph }))
      const ok = (c) =>
        c.y >= 2 &&
        c.x + c.w <= W - 2 &&
        !placed.some((p) => hit(c, { x: p.x - 4, y: p.y - 3, w: p.w + 8, h: p.h + 6 })) &&
        !regions.some((o) => o !== g && !contains(o, g) && hit(c, o))
      const pos = cands.find(ok) || cands.find((c) => c.y >= 2 && !placed.some((p) => hit(c, p))) || cands[2]
      placed.push(pos)
      outA += `<g id="Anotação: ${esc(g.label)}">`
      outA += `<rect x="${n(g.x + 1)}" y="${n(g.y + 1)}" width="${n(Math.max(0, g.w - 2))}" height="${n(Math.max(0, g.h - 2))}" rx="6" fill="none" stroke="${ANN}" stroke-width="2" stroke-dasharray="8 6"/>`
      outA += `<rect x="${n(pos.x)}" y="${n(pos.y)}" width="${n(pw)}" height="${ph}" rx="${ph / 2}" fill="${ANN}"/>`
      outA += `<text font-family="Atkinson Hyperlegible Next" font-size="${fsz}" font-weight="700" fill="#ffffff"><tspan x="${n(pos.x + 10)}" y="${n(pos.y + ph / 2 + fsz * 0.36)}">${esc(g.label)}</tspan></text>`
      outA += '</g>'
    }
    return outA ? `<g id="Anotações">${outA}</g>` : ''
  }

  const W = viewportOnly ? innerWidth : document.documentElement.scrollWidth

  const H = viewportOnly ? innerHeight : document.documentElement.scrollHeight
  const pageBg = getComputedStyle(document.body).backgroundColor
  const htmlBg = getComputedStyle(document.documentElement).backgroundColor
  const bg = visibleColor(pageBg) ? pageBg : visibleColor(htmlBg) ? htmlBg : '#ffffff'
  const root = document.getElementById('root') || document.body
  let content = await draw(root)
  for (const dialog of modals) {
    const back = getComputedStyle(dialog, '::backdrop').backgroundColor
    if (visibleColor(back)) content += `<rect id="fundo escurecido" x="${n(sx)}" y="${n(sy)}" width="${innerWidth}" height="${innerHeight}" fill="${back}"/>`
    content += await draw(dialog, true)
  }
  content += annotations(W)
  if (viewportOnly) {
    defs.push(`<clipPath id="tela"><rect width="${W}" height="${H}"/></clipPath>`)
    content = `<g clip-path="url(#tela)">${content}</g>`
  }
  return `<svg xmlns="${SVGNS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<title>${esc(pageName)}</title>
<defs>${defs.join('')}</defs>
<g id="${esc(pageName)}"><rect id="fundo" width="${W}" height="${H}" fill="${bg}"/>${content}</g>
</svg>
`
}

/* O Figma lê melhor cor em hexadecimal com opacidade separada do que rgba(). */
function figmaColors(svg) {
  const hex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return svg.replace(/(fill|stroke|stop-color|flood-color)="(rgba?\(([^)]*)\)|color\(srgb ([^)]*)\))"/g, (_, attr, _all, rgb, srgb) => {
    let r, g, b, a
    if (rgb !== undefined) {
      ;[r, g, b, a = 1] = rgb.split(/[\s,/]+/).filter(Boolean).map(Number)
    } else {
      ;[r, g, b, a = 1] = srgb.split(/[\s/]+/).filter(Boolean).map(Number)
      r *= 255
      g *= 255
      b *= 255
    }
    const color = `#${hex(r)}${hex(g)}${hex(b)}`
    const opAttr = { fill: 'fill-opacity', stroke: 'stroke-opacity', 'stop-color': 'stop-opacity', 'flood-color': 'flood-opacity' }[attr]
    return a < 1 ? `${attr}="${color}" ${opAttr}="${+a.toFixed(3)}"` : `${attr}="${color}"`
  })
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
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) console.warn('Sem ADMIN_EMAIL/ADMIN_PASSWORD: as telas do painel ficam de fora.')
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ args: ['--lang=pt-BR'] })
  for (const [vpName, viewport] of VIEWPORTS) {
    const label = vpName === 'computador' ? 'Computador' : 'Celular'
    const dir = path.join(OUT, vpName)
    fs.mkdirSync(dir, { recursive: true })
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', colorScheme: 'light', locale: 'pt-BR', timezoneId: 'America/Fortaleza' })
    await context.addInitScript(() => {
      try {
        localStorage.setItem('aagb-theme', 'light')
      } catch {
        /* sem armazenamento: tema padrão */
      }
    })
    const page = await context.newPage()
    const screens = [...SITE.filter((s) => !s[3] || s[3] === vpName), ...(ADMIN_EMAIL ? ADMIN : [])]
    let i = 0
    for (const [name, target, action] of screens) {
      i++
      const url = await resolveUrl(page, target)
      if (action === 'logout') await context.clearCookies()
      await page.goto(BASE + url, { waitUntil: 'load' })
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
      await page.waitForTimeout(500)
      if (action === 'login') {
        await page.getByLabel('E-mail').fill(ADMIN_EMAIL)
        await page.getByLabel('Senha').fill(ADMIN_PASSWORD)
        await page.getByRole('button', { name: 'Entrar' }).click()
        await page.getByRole('navigation', { name: 'Painel' }).waitFor()
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
        await page.waitForTimeout(800)
      }
      if (action === 'cart') {
        const add = page.getByRole('button', { name: 'Adicionar ao carrinho' })
        await add.nth(0).click()
        await add.nth(0).click()
        await add.nth(2).click()
        await add.nth(4).click()
        // Espera o aviso "adicionado ao carrinho" sumir e volta ao topo antes de abrir.
        await page.evaluate(() => scrollTo(0, 0))
        await page.waitForTimeout(6000)
        await page.getByRole('button', { name: /^Carrinho/ }).click()
      }
      if (action === 'menu') await page.getByRole('button', { name: 'Abrir menu' }).click()
      if (action === 'edit') await page.getByRole('button', { name: /^Editar/ }).first().click()
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
      await page.evaluate(async () => {
        for (const img of document.images) img.loading = 'eager'
        await Promise.all([...document.images].map((im) => (im.complete ? null : new Promise((r) => (im.onload = im.onerror = r)))))
        await document.fonts.ready
      })
      await page.mouse.move(0, 0)
      await page.waitForTimeout(400)
      const viewportOnly = Boolean(action && action !== 'login' && action !== 'logout')
      const file = `${String(i).padStart(2, '0')} ${label} - ${name}`
      await page.screenshot({ path: path.join(dir, `${file}.png`), fullPage: !viewportOnly })
      const svg = figmaColors(await page.evaluate(toSvg, { pageName: `${label} - ${name}`, viewportOnly }))
      fs.writeFileSync(path.join(dir, `${file}.svg`), svg)
      console.log(`${file}  ${page.url().replace(BASE, '')}  ${(svg.length / 1024).toFixed(0)} KB`)
      if (action === 'cart' || action === 'edit' || action === 'menu') await page.keyboard.press('Escape')
      // O carrinho de exemplo não deve aparecer no contador das próximas telas.
      if (action === 'cart') await page.evaluate(() => localStorage.removeItem('aagb-cart'))
    }
    await context.close()
  }
  await browser.close()
})()
