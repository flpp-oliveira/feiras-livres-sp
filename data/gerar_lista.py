# -*- coding: utf-8 -*-
"""
Gera site/lista.html: pagina de texto rastreavel pelo Google com TODAS as feiras
(endereco + bairro + distrito + dia + categoria), agrupadas por zona e bairro.
NAO inclui coordenadas de proposito (o geocoding enriquecido nao vai pra fora).
Roda a partir da pasta data/. Fonte: feiras_geo.csv.
"""
import csv, os, html

SRC = 'feiras_geo.csv'
OUT = os.path.join('..', 'site', 'lista.html')
TOKEN = '2eb060762d524d85ad7d70e2b67fa203'  # beacon do Cloudflare (publico)

ORDEM_DIAS = ["Domingo", "Terça Feira", "Quarta Feira", "Quinta Feira", "Sexta Feira", "Sábado"]
EMOJI = {"Tradicional": "🧺", "Orgânica": "🌱", "Noturna": "🌙"}

ZONA_POR_SUBPREF = {
    "Sé": "Centro",
    "Casa Verde/Cachoeirinha": "Zona Norte", "Freguesia/Brasilândia": "Zona Norte",
    "Jaçanã/Tremembé": "Zona Norte", "Perus": "Zona Norte", "Pirituba/Jaraguá": "Zona Norte",
    "Santana/Tucuruvi": "Zona Norte", "Vila Maria/Vila Guilherme": "Zona Norte",
    "Butantã": "Zona Oeste", "Lapa": "Zona Oeste", "Pinheiros": "Zona Oeste",
    "Campo Limpo": "Zona Sul", "Capela do Socorro": "Zona Sul", "Cidade Ademar": "Zona Sul",
    "Ipiranga": "Zona Sul", "Jabaquara": "Zona Sul", "M'Boi Mirim": "Zona Sul",
    "Parelheiros": "Zona Sul", "Santo Amaro": "Zona Sul", "Vila Mariana": "Zona Sul",
    "Aricanduva/Formosa/Carrão": "Zona Leste", "Cidade Tiradentes": "Zona Leste",
    "Ermelino Matarazzo": "Zona Leste", "Guaianases": "Zona Leste", "Itaim Paulista": "Zona Leste",
    "Itaquera": "Zona Leste", "Mooca": "Zona Leste", "Penha": "Zona Leste",
    "São Mateus": "Zona Leste", "São Miguel": "Zona Leste", "Sapopemba": "Zona Leste",
    "Vila Prudente": "Zona Leste"
}
ORDEM_ZONAS = ["Centro", "Zona Norte", "Zona Leste", "Zona Oeste", "Zona Sul"]


def endereco(r):
    partes = (r.get('tipo_logradouro', '') + ' ' + r.get('logradouro', '')).strip()
    num = (r.get('numero') or '').strip()
    if num and num.upper() != 'S/N':
        partes += ', ' + num
    return partes


def esc(s):
    return html.escape((s or '').strip())


def main():
    rows = list(csv.DictReader(open(SRC, encoding='utf-8-sig')))
    # agrupa por zona -> bairro -> lista de feiras
    zonas = {z: {} for z in ORDEM_ZONAS}
    for r in rows:
        z = ZONA_POR_SUBPREF.get(r.get('subprefeitura', ''), None)
        if not z:
            continue
        bairro = (r.get('bairro') or 'Outros').strip() or 'Outros'
        zonas[z].setdefault(bairro, []).append(r)

    total = sum(len(b) for z in zonas.values() for b in z.values())
    dia_idx = {d: i for i, d in enumerate(ORDEM_DIAS)}

    P = []
    P.append('<!DOCTYPE html>')
    P.append('<html lang="pt-BR">')
    P.append('<head>')
    P.append('  <meta charset="UTF-8" />')
    P.append('  <meta http-equiv="Content-Security-Policy" content="default-src \'self\'; '
             "script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; "
             "img-src 'self' data:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; "
             'object-src \'none\'; base-uri \'self\'" />')
    P.append('  <meta name="viewport" content="width=device-width, initial-scale=1.0" />')
    P.append('  <meta name="theme-color" content="#2b8a3e" />')
    P.append('  <title>Lista de feiras livres de São Paulo por bairro e dia</title>')
    P.append('  <meta name="description" content="Lista completa das ' + str(total) +
             ' feiras livres de São Paulo, organizadas por zona e bairro, com endereço e dia da semana." />')
    P.append('  <link rel="canonical" href="https://feiras-livres-sp.pages.dev/lista" />')
    P.append('  <link rel="icon" href="favicon.ico" sizes="any" />')
    P.append('  <link rel="icon" type="image/png" sizes="32x32" href="favicon-32x32.png" />')
    P.append('  <link rel="apple-touch-icon" href="apple-touch-icon.png" />')
    P.append('  <link rel="stylesheet" href="fonts/fonts.css" />')
    P.append('  <style>')
    P.append("""    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Plus Jakarta Sans", system-ui, sans-serif; color: #21251f; background: #f4f6f1; line-height: 1.5; }
    header.top { background: linear-gradient(150deg, #35a44d, #1a6630); color: #fff; padding: 20px; }
    header.top .wrap, main, footer.rodape { max-width: 860px; margin: 0 auto; }
    header.top .wrap { display: flex; align-items: center; gap: 12px; }
    .badge { width: 44px; height: 44px; flex-shrink: 0; display: grid; place-items: center; font-size: 24px;
      background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.28); border-radius: 14px; }
    header.top .marca-nome { font-family: "Fraunces", Georgia, serif; font-size: 1.35rem; font-weight: 600; }
    header.top a { color: #fff; font-weight: 600; font-size: .85rem; text-decoration: none; opacity: .92; }
    header.top a:hover { text-decoration: underline; }
    main { padding: 24px 20px 40px; }
    main > h1.titulo { font-family: "Fraunces", Georgia, serif; font-size: 1.6rem; margin: 8px 0 6px; }
    .intro { color: #57534e; margin: 0 0 20px; }
    nav.zonas { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 28px; }
    nav.zonas a { background: #fff; border: 1.5px solid #e7e5df; border-radius: 999px; padding: 6px 14px;
      text-decoration: none; color: #1d6b2f; font-weight: 600; font-size: .82rem; }
    nav.zonas a:hover { border-color: #2b8a3e; background: #e9f6ec; }
    section.zona { margin: 0 0 36px; }
    section.zona > h2 { font-size: 1.25rem; color: #1d6b2f; border-bottom: 2px solid #e7e5df; padding-bottom: 6px; }
    section.zona > h2 .qtd { font-size: .8rem; color: #7a776f; font-weight: 600; }
    h3.bairro { font-size: 1rem; margin: 20px 0 6px; color: #21251f; }
    ul.feiras { list-style: none; margin: 0; padding: 0; }
    ul.feiras li { padding: 7px 0; border-bottom: 1px solid #eceae4; font-size: .92rem; }
    ul.feiras li:last-child { border-bottom: none; }
    .end { font-weight: 700; }
    .meta { color: #57534e; }
    .dia { color: #1d6b2f; font-weight: 600; }
    footer.rodape { padding: 24px 20px 40px; color: #7a776f; font-size: .8rem; }
    footer.rodape a { color: #1d6b2f; }
    a.voltar-topo { display: inline-block; margin-top: 8px; font-size: .8rem; color: #1d6b2f; text-decoration: none; }""")
    P.append('  </style>')
    P.append('</head>')
    P.append('<body>')
    P.append('  <header class="top"><div class="wrap">')
    P.append('    <span class="badge">🧺</span>')
    P.append('    <div style="flex:1"><span class="marca-nome">Feiras Livres SP</span></div>')
    P.append('    <a href="/">← Ver no mapa</a>')
    P.append('  </div></header>')
    P.append('  <main>')
    P.append('    <h1 class="titulo">Feiras livres de São Paulo — lista completa</h1>')
    P.append('    <p class="intro">Todas as <strong>' + str(total) + ' feiras livres</strong> da cidade de São Paulo, '
             'organizadas por zona e bairro, com endereço e dia da semana. '
             'Prefira usar o <a href="/">mapa interativo</a> para achar as feiras perto de você.</p>')
    # nav de zonas
    P.append('    <nav class="zonas">')
    for z in ORDEM_ZONAS:
        if zonas[z]:
            anchor = z.lower().replace(' ', '-').replace('ô', 'o')
            P.append('      <a href="#' + anchor + '">' + esc(z) + '</a>')
    P.append('    </nav>')

    for z in ORDEM_ZONAS:
        bairros = zonas[z]
        if not bairros:
            continue
        anchor = z.lower().replace(' ', '-').replace('ô', 'o')
        qtd = sum(len(v) for v in bairros.values())
        P.append('    <section class="zona" id="' + anchor + '">')
        P.append('      <h2>' + esc(z) + ' <span class="qtd">(' + str(qtd) + ' feiras)</span></h2>')
        for bairro in sorted(bairros.keys(), key=lambda s: s.lower()):
            feiras = sorted(bairros[bairro], key=lambda r: (dia_idx.get(r.get('dia', ''), 9), endereco(r).lower()))
            P.append('      <h3 class="bairro">' + esc(bairro) + '</h3>')
            P.append('      <ul class="feiras">')
            for r in feiras:
                cat = r.get('categoria', '')
                emoji = EMOJI.get(cat, '🛒')
                distrito = (r.get('distrito') or '').strip()
                meta = esc(r.get('dia', '').replace(' Feira', ''))
                extra = ' · Distrito ' + esc(distrito) if distrito and distrito != bairro else ''
                P.append('        <li><span class="end">' + esc(endereco(r)) + '</span> '
                         '<span class="meta">— <span class="dia">' + meta + '</span>' + extra +
                         ' · ' + emoji + ' ' + esc(cat) + '</span></li>')
            P.append('      </ul>')
        P.append('      <a class="voltar-topo" href="#">↑ voltar ao topo</a>')
        P.append('    </section>')

    P.append('  </main>')
    P.append('  <footer class="rodape">')
    P.append('    <p>Dados: Prefeitura de São Paulo / SMSUB (set/2024). '
             'Veja também o <a href="/">mapa interativo</a>.</p>')
    P.append('  </footer>')
    P.append('  <script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" '
             'data-cf-beacon=\'{"token": "' + TOKEN + '"}\'></script>')
    P.append('</body>')
    P.append('</html>')

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(P) + '\n')
    print(OUT + ': ' + str(total) + ' feiras em ' +
          str(sum(len(b) for b in zonas.values())) + ' bairros, ' +
          str(len([z for z in ORDEM_ZONAS if zonas[z]])) + ' zonas')


if __name__ == '__main__':
    main()
