/*
 * Gera cópias estáticas das páginas do site prontas para importar no Figma.
 *
 * Cada página vira um HTML único, sem JavaScript, sem variáveis de CSS e sem
 * animações: todo estilo já vem calculado no próprio elemento, as imagens vêm
 * embutidas e os pseudo-elementos (::before/::after) viram elementos de verdade.
 * Também sai um PNG da página inteira, que entra no Figma só arrastando.
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

/* Roda dentro da página: transforma o DOM vivo num HTML com estilos fixos. */
async function snapshot() {
  const FONT_RENAME = { 'Bricolage Grotesque Variable': 'Bricolage Grotesque' }
  const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'STYLE'])

  // Estilos padrão de cada tag, para só gravar o que difere.
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:absolute;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const blank = frame.contentDocument
  const defaults = new Map()
  function defaultsFor(el) {
    const key = el.namespaceURI + el.tagName + (el.hasAttribute('href') ? '@href' : '') + (el.getAttribute('type') || '')
    if (!defaults.has(key)) {
      const probe = blank.createElementNS(el.namespaceURI, el.localName)
      if (el.hasAttribute('href')) probe.setAttribute('href', '#')
      if (el.hasAttribute('type')) probe.setAttribute('type', el.getAttribute('type'))
      ;(el.namespaceURI === 'http://www.w3.org/2000/svg' && el.localName !== 'svg'
        ? blank.body.appendChild(blank.createElementNS('http://www.w3.org/2000/svg', 'svg'))
        : blank.body
      ).appendChild(probe)
      const cs = frame.contentWindow.getComputedStyle(probe)
      const map = {}
      for (const p of cs) map[p] = cs.getPropertyValue(p)
      defaults.set(key, map)
    }
    return defaults.get(key)
  }

  const imageCache = new Map()
  async function toDataUrl(src) {
    if (!src || src.startsWith('data:')) return src
    if (!imageCache.has(src)) {
      imageCache.set(
        src,
        fetch(src)
          .then((r) => r.blob())
          .then(
            (b) =>
              new Promise((res) => {
                const fr = new FileReader()
                fr.onload = () => res(fr.result)
                fr.readAsDataURL(b)
              }),
          )
          .catch(() => src),
      )
    }
    return imageCache.get(src)
  }

  // Diz se largura/altura do elemento já sairiam iguais sem valor fixo (ou seja, são automáticas).
  function autoSizes(el) {
    if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml' || /^(IMG|INPUT|TEXTAREA|SELECT|BUTTON|IFRAME|VIDEO|CANVAS)$/.test(el.tagName)) return new Set()
    const before = el.getBoundingClientRect()
    const saved = el.getAttribute('style')
    const skip = new Set()
    for (const [prop, dim] of [['height', 'height'], ['width', 'width']]) {
      el.style.setProperty(prop, 'auto', 'important')
      const now = el.getBoundingClientRect()
      if (Math.abs(now[dim] - before[dim]) < 0.5 && Math.abs(now.x - before.x) < 0.5 && Math.abs(now.y - before.y) < 0.5) {
        skip.add(prop).add(prop === 'height' ? 'block-size' : 'inline-size')
      }
      if (saved === null) el.removeAttribute('style')
      else el.setAttribute('style', saved)
    }
    return skip
  }

  // Propriedades que passam de pai para filho: só podem ser omitidas se o valor
  // for igual ao padrão da tag E ao do pai.
  const INHERITED = /^(color|cursor|direction|font|letter-spacing|line-height|list-style|orphans|quotes|tab-size|text-(align|indent|shadow|transform|rendering|wrap|size-adjust|emphasis|underline-position|anchor|combine-upright|orientation)|visibility|white-space|widows|word-(break|spacing|wrap)|overflow-wrap|hyphens|caret-color|accent-color|color-scheme|paint-order|fill|stroke|-webkit-text|writing-mode|border-collapse|border-spacing|caption-side|empty-cells|image-rendering|pointer-events|speak|forced-color-adjust|print-color-adjust|-webkit-font|-webkit-locale|-webkit-hyphenate|-webkit-line-break|-webkit-rtl|-webkit-user-modify|-webkit-print|user-select|ruby-position|math-|dominant-baseline|shape-rendering|clip-rule|marker|stroke|fill-rule)/

  function styleText(cs, base, skip = new Set(), parent = null) {
    const out = []
    for (const p of cs) {
      if (skip.has(p)) continue
      if (p.startsWith('--') || p.startsWith('animation') || p.startsWith('transition')) continue
      if (p === 'cursor' || p.startsWith('-webkit-tap') || p === 'will-change') continue
      let v = cs.getPropertyValue(p)
      // Margens e recuos padrão dependem do tamanho da fonte (1em): sempre gravar.
      if (base && base[p] === v && !/^(margin|padding)-(top|right|bottom|left)$/.test(p) && (!parent || !INHERITED.test(p) || parent.getPropertyValue(p) === v)) continue
      if (p === 'font-family') for (const [a, b] of Object.entries(FONT_RENAME)) v = v.split(a).join(b)
      out.push(`${p}:${v}`)
    }
    return out.join(';')
  }

  async function bgImages(style) {
    const urls = [...style.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1])
    for (const u of urls) style = style.split(u).join(await toDataUrl(u))
    return style
  }

  async function pseudo(el, which, index) {
    const cs = getComputedStyle(el, which)
    const content = cs.getPropertyValue('content')
    if (!content || content === 'none' || content === 'normal') return null
    const span = document.createElement('span')
    span.setAttribute('data-pseudo', which)
    let text = ''
    if (content.startsWith('"')) text = JSON.parse(content.replace(/^"(.*)"$/s, '"$1"'))
    else if (content.startsWith('counter(')) text = String(index + 1)
    span.textContent = text
    span.setAttribute('style', await bgImages(styleText(cs, defaultsFor(span), new Set(), getComputedStyle(el))))
    return span
  }

  async function clone(el, index) {
    if (el.nodeType === Node.TEXT_NODE) return document.createTextNode(el.textContent)
    if (el.nodeType !== Node.ELEMENT_NODE || SKIP.has(el.tagName) || el === frame) return null
    const cs = getComputedStyle(el)
    if (cs.display === 'none') return null
    // Fora do que aparece na tela: link de pular conteúdo e textos só para leitor de tela.
    const r = el.getBoundingClientRect()
    if (el !== document.body && r.bottom + scrollY <= 0) return null
    if (r.width <= 1 && r.height <= 1 && (cs.overflow === 'hidden' || cs.clip !== 'auto' || cs.clipPath !== 'none')) return null
    const copy = document.createElementNS(el.namespaceURI, el.localName)
    for (const a of el.attributes) {
      if (a.name === 'class' || a.name === 'style' || a.name.startsWith('on')) continue
      if (a.name === 'srcset' || a.name === 'sizes' || a.name === 'loading') continue
      copy.setAttribute(a.name, a.value)
    }
    if (el.tagName === 'IMG') copy.setAttribute('src', await toDataUrl(el.currentSrc || el.src))
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') copy.setAttribute('value', el.value)
    copy.setAttribute('style', await bgImages(styleText(cs, defaultsFor(el), autoSizes(el), el.parentElement ? getComputedStyle(el.parentElement) : null)))

    const before = await pseudo(el, '::before', index)
    if (before) copy.appendChild(before)
    let i = 0
    for (const child of el.childNodes) {
      const c = await clone(child, child.nodeType === 1 ? i++ : i)
      if (c) copy.appendChild(c)
    }
    const after = await pseudo(el, '::after', index)
    if (after) copy.appendChild(after)
    return copy
  }

  // Fontes usadas de fato, embutidas, para o HTML abrir igual ao site.
  const loaded = new Set(
    [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family.replace(/"/g, '')}|${f.weight}|${f.style}|${f.unicodeRange}`),
  )
  const fontFaces = []
  for (const sheet of document.styleSheets) {
    let rules
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    for (const r of rules) {
      if (!(r instanceof CSSFontFaceRule)) continue
      const st = r.style
      const fam = st.getPropertyValue('font-family').replace(/["']/g, '').trim()
      const key = `${fam}|${st.getPropertyValue('font-weight') || 'normal'}|${st.getPropertyValue('font-style') || 'normal'}|${st.getPropertyValue('unicode-range') || 'U+0-10FFFF'}`
      if (!loaded.has(key)) continue
      const m = /url\("?([^")]+\.woff2)"?\)/.exec(st.getPropertyValue('src'))
      if (!m) continue
      const data = await toDataUrl(new URL(m[1], sheet.href || location.href).href)
      const name = FONT_RENAME[fam] || fam
      fontFaces.push(
        `@font-face{font-family:'${name}';font-style:${st.getPropertyValue('font-style') || 'normal'};font-weight:${st.getPropertyValue('font-weight') || 'normal'};font-display:block;src:url(${data}) format('woff2');unicode-range:${st.getPropertyValue('unicode-range') || 'U+0-10FFFF'}}`,
      )
    }
  }

  const bodyCopy = await clone(document.body, 0)
  frame.remove()
  const htmlStyle = styleText(getComputedStyle(document.documentElement), null)
    .split(';')
    .filter((d) => /^(background-color|color|font-family|font-size|line-height)/.test(d))
    .join(';')
  return { body: bodyCopy.outerHTML, htmlStyle, title: document.title, fonts: fontFaces.join('\n') }
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
      } catch {}
    })
    for (const [name, target] of PAGES) {
      const url = await resolveUrl(page, target)
      await page.goto(BASE + url, { waitUntil: 'networkidle' })
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
      await page.evaluate(() => document.fonts.ready)
      // Força o carregamento das imagens preguiçosas.
      await page.evaluate(async () => {
        for (const img of document.images) img.loading = 'eager'
        await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))))
      })
      await page.waitForTimeout(300)
      await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true })
      const snap = await page.evaluate(snapshot)
      const html = `<!doctype html>
<html lang="pt-BR" style="${snap.htmlStyle}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${viewport.width}">
<title>${snap.title}</title>
<style>
${snap.fonts}
*,*::before,*::after{box-sizing:border-box}html,body{margin:0}</style>
</head>
${snap.body}
</html>
`
      fs.writeFileSync(path.join(dir, `${name}.html`), html)
      console.log(`${vpName}/${name}  ${url}  ${(html.length / 1024).toFixed(0)} KB`)
    }
    await page.close()
  }
  await browser.close()
})()
