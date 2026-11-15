/* Mapa das Feiras Livres de São Paulo */
(function () {
  "use strict";

  var FEIRAS = window.FEIRAS || [];

  // cores por dia da semana
  var CORES = {
    "Domingo": "#e53935",
    "Terça Feira": "#fb8c00",
    "Quarta Feira": "#8e24aa",
    "Quinta Feira": "#00897b",
    "Sexta Feira": "#1e88e5",
    "Sábado": "#6d4c41"
  };
  var ORDEM_DIAS = ["Domingo", "Terça Feira", "Quarta Feira", "Quinta Feira", "Sexta Feira", "Sábado"];
  var NOMES_JS = ["Domingo", "Segunda Feira", "Terça Feira", "Quarta Feira", "Quinta Feira", "Sexta Feira", "Sábado"];

  // emoji por tipo (categoria) de feira
  var EMOJI = { "Tradicional": "🧺", "Orgânica": "🌱", "Noturna": "🌙" };
  function emojiCat(c) { return EMOJI[c] || "🛒"; }
  function corDia(dia) { return CORES[dia] || "#555"; }

  // zona da cidade a partir da subprefeitura (classificacao aproximada)
  var ZONA_POR_SUBPREF = {
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
  };
  function zonaDe(f) { return ZONA_POR_SUBPREF[f.subprefeitura] || ""; }

  // normaliza texto p/ busca sem acento ("sao" acha "São")
  function norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // distancia de edicao (Levenshtein) -- usada so como fallback quando a
  // busca exata (indexOf) nao acha nada, pra tolerar erro de digitacao
  // ("Pinheros" -> "Pinheiros"). Tolerancia cresce com o tamanho da palavra:
  // curta demais e quase tudo "parece" com quase tudo (muito ruido).
  function levenshtein(a, b) {
    var m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    var prev = new Array(n + 1), curr = new Array(n + 1);
    for (var j = 0; j <= n; j++) prev[j] = j;
    for (var i = 1; i <= m; i++) {
      curr[0] = i;
      for (j = 1; j <= n; j++) {
        var custo = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + custo);
      }
      var tmp = prev; prev = curr; curr = tmp;
    }
    return prev[n];
  }
  function toleranciaFuzzy(len) {
    if (len <= 3) return 0;   // palavra curta: so exata (senao vira ruido)
    if (len <= 6) return 1;
    return 2;
  }
  // menor distancia entre "q" e qualquer palavra de "alvo" (string com varias
  // palavras separadas por espaco) -- null se nada ficar dentro da tolerancia
  function distanciaFuzzyMin(q, alvo) {
    var palavras = alvo.split(/\s+/).filter(Boolean);
    var melhor = null;
    for (var i = 0; i < palavras.length; i++) {
      var p = palavras[i];
      var tol = Math.min(toleranciaFuzzy(q.length), toleranciaFuzzy(p.length));
      if (tol === 0) continue;
      if (Math.abs(p.length - q.length) > tol) continue; // atalho, evita Levenshtein a toa
      var d = levenshtein(q, p);
      if (d <= tol && (melhor === null || d < melhor)) melhor = d;
    }
    return melhor;
  }

  // "Rua/Avenida... + nome + numero" (numero so quando existe e nao e "S/N")
  function nomeFeira(f) {
    var nome = ((f.tipo || "") + " " + (f.logradouro || "")).trim();
    var num = (f.numero == null ? "" : String(f.numero)).trim();
    if (num && num.toUpperCase() !== "S/N") nome += ", " + num;
    return nome;
  }

  // ---- mapa base ----
  // MapLibre + OpenFreeMap: a carta chega como dado (vetorial) e e desenhada
  // no proprio aparelho — nitida em qualquer zoom, sem chave e sem limite de uso.
  // Escala de zoom do MapLibre: o mesmo enquadramento do Leaflet fica 1 nivel
  // abaixo (o "mundo" dele tem 512 px no zoom 0, o do Leaflet 256).
  // Bright: cores suaves (fundo bege, avenidas amarelas). Alternativas do
  // OpenFreeMap: "positron" (cinza, a mais neutra) e "liberty" (a mais colorida)
  var OFM_ESTILO = "https://tiles.openfreemap.org/styles/bright";
  // Os pontos de interesse da carta (pontos de onibus — que em SP levam o
  // endereco como nome —, lojas, aeroporto) competiam com os pinos das feiras.
  // Nomes de rua e de bairro ficam: sao eles que orientam.
  function ehPoiDaCarta(id) { return /^poi_|^airport$|housenumber/i.test(id); }
  // quem pediu menos movimento no sistema nao ve o mapa deslizar
  var semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // caixa [[oeste, sul], [leste, norte]] com folga proporcional (como o pad do Leaflet)
  function limitesDe(pontos, folga) {
    var w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    pontos.forEach(function (p) {
      if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0];
      if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1];
    });
    var dx = (e - w) * folga, dy = (n - s) * folga;
    return [[w - dx, s - dy], [e + dx, n + dy]];
  }

  // pontos validos (lng, lat) — o mapa ja nasce enquadrado neles, sem o salto
  // de abrir num centro fixo e so depois enquadrar
  var coords = [];
  FEIRAS.forEach(function (f) {
    if (f.lat == null || f.lng == null || f.lat === "" || f.lng === "") return;
    coords.push([+f.lng, +f.lat]);
  });
  var limites = coords.length ? limitesDe(coords, 0.03) : null;

  var opcoesMapa = {
    container: "map",
    style: OFM_ESTILO,
    maxZoom: 18,
    // sem girar nem inclinar: sem bussola na tela, um mapa girado sem querer
    // nao teria como voltar ao norte
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: { compact: true },
    locale: {
      "Map.Title": "Mapa das feiras livres",
      "NavigationControl.ZoomIn": "Aproximar",
      "NavigationControl.ZoomOut": "Afastar",
      "AttributionControl.ToggleAttribution": "Mostrar os créditos do mapa",
      "Popup.Close": "Fechar"
    }
  };
  // (opcao com valor undefined quebra o MapLibre: so entra a que existe)
  if (limites) {
    opcoesMapa.bounds = limites;
    // pan pelos arredores, sem sair da regiao. Folga larga de proposito: o
    // MapLibre obriga a TELA inteira a caber nesta caixa, e uma caixa justa
    // forcava zoom a mais em tela larga, cortando o norte e o sul da cidade.
    opcoesMapa.maxBounds = limitesDe(coords, 1);
  } else {
    opcoesMapa.center = [-46.6333, -23.5505];
    opcoesMapa.zoom = 10;
  }
  var map = new maplibregl.Map(opcoesMapa);
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
  // O botao de localizacao entra NA pilha de controles do mapa, acima do zoom:
  // assim os dois ficam sempre alinhados e espacados, seja qual for a altura
  // dos creditos embaixo (antes era posicionado a mao e chegou a encostar).
  map.addControl({
    onAdd: function () {
      var caixa = document.createElement("div");
      caixa.className = "maplibregl-ctrl ctrl-local";
      caixa.appendChild(document.getElementById("voltar-localizacao"));
      return caixa;
    },
    onRemove: function () {}
  }, "bottom-right");
  window.__mapa = map; // depuracao

  // Se a carta nao chegar (OpenFreeMap fora do ar), os pinos aparecem mesmo
  // assim, sobre um fundo liso: o site continua respondendo "onde tem feira".
  var FUNDO_LISO = {
    version: 8, sources: {},
    layers: [{ id: "fundo", type: "background", paint: { "background-color": "#e8ece4" } }]
  };
  var cartaFalhou = false;
  map.on("error", function () {
    if (cartaFalhou || map.isStyleLoaded()) return;
    cartaFalhou = true;
    map.setStyle(FUNDO_LISO);
  });

  // pino desenhado uma unica vez por combinacao (dia x tipo) e entregue ao
  // mapa como imagem: os ~1000 pinos sao uma camada so, desenhada pela placa
  // de video (nenhum elemento por pino na pagina).
  var PIN_W = 30, PIN_H = 38;
  function desenharPin(cor, emoji) {
    var esc2 = 2; // sempre em dobro: nitido em tela retina e quando o mapa aumenta o pino
    var W = PIN_W, H = PIN_H, r = 11, cx = W / 2, cy = 13;
    var cv = document.createElement("canvas");
    cv.width = W * esc2; cv.height = H * esc2;
    var x = cv.getContext("2d");
    x.scale(esc2, esc2);
    // sombra assada na imagem (sem custo em tempo real)
    x.shadowColor = "rgba(0,0,0,.35)"; x.shadowBlur = 3; x.shadowOffsetY = 2;
    // ponta (triangulo)
    x.beginPath();
    x.moveTo(cx - 6, cy + 7); x.lineTo(cx + 6, cy + 7); x.lineTo(cx, H - 1); x.closePath();
    x.fillStyle = cor; x.fill();
    // corpo (circulo) por cima, com borda branca
    x.beginPath(); x.arc(cx, cy, r, 0, 2 * Math.PI);
    x.fillStyle = cor; x.fill();
    x.shadowColor = "transparent";
    x.lineWidth = 2; x.strokeStyle = "#fff"; x.stroke();
    // emoji do tipo
    x.font = "15px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";
    x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(emoji, cx, cy + 1);
    return x.getImageData(0, 0, cv.width, cv.height);
  }
  function chavePin(f) { return "pin|" + f.dia + "|" + f.categoria; }
  function registraPinos() {
    FEIRAS.forEach(function (f) {
      var k = chavePin(f);
      if (!map.hasImage(k)) map.addImage(k, desenharPin(corDia(f.dia), emojiCat(f.categoria)), { pixelRatio: 2 });
    });
  }

  // pins menores na visao afastada (cidade toda); tamanho normal a partir deste zoom
  var ZOOM_PINS_NORMAIS = 12;
  var ESCALA_PIN_AFASTADO = 0.62;
  function escalaPins() { return map.getZoom() < ZOOM_PINS_NORMAIS ? ESCALA_PIN_AFASTADO : 1; }

  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function campo(v) {
    var s = (v == null ? "" : String(v)).trim();
    return s ? esc(s) : "N/A";
  }

  function popupHTML(f) {
    var rota = "https://www.google.com/maps/dir/?api=1&destination=" + f.lat + "," + f.lng;
    return '<div class="popup-feira">' +
      '<span class="badge" style="background:' + corDia(f.dia) + '">' + esc(f.dia) + "</span> " +
      '<span class="badge badge-cat">' + emojiCat(f.categoria) + " " + esc(f.categoria) + "</span>" +
      // ficha em blocos: rotulo pequeno em cima, valor embaixo; a rua ocupa a
      // largura toda, bairro e distrito lado a lado (dl > div e HTML valido)
      '<dl class="popup-info">' +
      '<div class="pi-largo"><dt>Rua</dt><dd class="pi-rua">' + campo(nomeFeira(f)) + "</dd></div>" +
      "<div><dt>Bairro</dt><dd>" + campo(f.bairro) + "</dd></div>" +
      "<div><dt>Distrito</dt><dd>" + campo(f.distrito) + "</dd></div>" +
      "<div><dt>Cep</dt><dd>" + campo(f.cep) + "</dd></div>" +
      "</dl>" +
      '<div class="popup-acoes">' +
      '<a class="btn-rota" href="' + rota + '" target="_blank" rel="noopener">' + ICONE_ROTA + "<span>Como chegar</span></a>" +
      '<button type="button" class="btn-compartilhar">' + ICONE_COMPARTILHA + "<span>Compartilhar</span></button>" +
      "</div>" +
      '<button type="button" class="btn-reportar">Reportar erro nesta feira</button>' +
      "</div>";
  }
  // icones de traco, no mesmo desenho do de compartilhar (o emoji da bussola
  // mudava de cara em cada aparelho e destoava do botao ao lado)
  var ICONE_ROTA = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 11l18-8-8 18-2-8-8-2z"></path></svg>';
  var ICONE_COMPARTILHA = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle>' +
    '<path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"></path></svg>';

  // ---- popup de uma feira ----
  // Ancorado na ponta do pino; o deslocamento sobe ate a cabeca dele, seja
  // qual for o lado em que o MapLibre o abrir (perto da borda ele inverte).
  var popupAtual = null;
  function fechaPopup() {
    if (popupAtual) { var p = popupAtual; popupAtual = null; p.remove(); }
  }
  function abrePopup(m) {
    fechaPopup();
    dicaHover.remove();
    var h = (PIN_H - 6) * escalaPins(), meio = PIN_W / 2 * escalaPins();
    var p = new maplibregl.Popup({
      maxWidth: "300px",
      focusAfterOpen: false,
      offset: {
        "top": [0, 0], "top-left": [0, 0], "top-right": [0, 0],
        "bottom": [0, -h], "bottom-left": [0, -h], "bottom-right": [0, -h],
        "left": [meio, -h / 2], "right": [-meio, -h / 2]
      }
    }).setLngLat([m.lng, m.lat]).setHTML(popupHTML(m.feira)).addTo(map);
    p.m = m;
    var el = p.getElement();
    var comp = el.querySelector(".btn-compartilhar");
    if (comp) comp.onclick = function () { compartilharFeira(m.feira, comp); };
    var rep = el.querySelector(".btn-reportar");
    if (rep) rep.onclick = function () { abrirReporte(m.feira); };
    p.on("close", function () { if (popupAtual === p) popupAtual = null; });
    popupAtual = p;
  }

  // ---- link de cada feira (?feira=1001-4) ----
  function linkDaFeira(f) {
    return location.origin + location.pathname + "?feira=" + encodeURIComponent(f.id);
  }
  // No celular, o menu de compartilhar do proprio aparelho (WhatsApp etc.).
  // Onde ele nao existe (computador), o link vai para a area de transferencia.
  function compartilharFeira(f, botao) {
    var nome = "Feira livre — " + nomeFeira(f);
    var onde = [f.bairro, f.dia].filter(Boolean).join(" · ");
    var url = linkDaFeira(f);
    if (navigator.share) {
      // rejeita quando a pessoa fecha o menu sem escolher: nao e erro
      navigator.share({ title: nome, text: nome + "\n" + onde, url: url }).catch(function () {});
      return;
    }
    var rot = botao.querySelector("span");
    function feito(ok) {
      rot.textContent = ok ? "Link copiado!" : "Não foi possível copiar";
      setTimeout(function () { rot.textContent = "Compartilhar"; }, 2500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(nome + "\n" + onde + "\n" + url).then(function () { feito(true); }, function () { feito(false); });
    } else {
      feito(false);
    }
  }

  // ---- movimentos do mapa ----
  // comPopup: no celular a feira desce um pouco abaixo do centro, para o popup
  // (que abre para cima) nao ficar escondido atras da barra de busca
  function irPara(lat, lng, zoom, comPopup) {
    var desce = comPopup && window.matchMedia("(max-width: 760px)").matches ? Math.round(window.innerHeight * 0.14) : 0;
    map.easeTo({ center: [lng, lat], zoom: zoom, offset: [0, desce], duration: semMovimento ? 0 : 600 });
  }
  // bolinha sobre o mapa (voce, ponto sugerido): elemento da pagina, sempre
  // acima dos pinos e sem receber toque
  function marcadorDe(classe, lat, lng) {
    var el = document.createElement("div");
    el.className = classe;
    el.innerHTML = "<span></span>";
    return new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
  }
  function enquadra(pontos, folga) { // pontos: [{lat, lng}]
    var caixa = limitesDe(pontos.map(function (p) { return [p.lng, p.lat]; }), folga);
    map.fitBounds(caixa, { padding: 24, maxZoom: 16, duration: semMovimento ? 0 : 600 });
  }

  // trava o afastamento no zoom que mostra TODAS as feiras. Recalculado a cada
  // mudanca de tamanho (rotacao / barra do navegador no mobile): se ficasse so
  // no load, a trava vinha alta demais e "prendia" o zoom antes de ver tudo.
  function atualizarZoomMin() {
    if (!limites) return;
    map.setMinZoom(null);                       // solta a trava pra medir o enquadramento real
    var cam = map.cameraForBounds(limites);
    if (cam) map.setMinZoom(cam.zoom);          // trava no zoom que enquadra tudo
  }

  // ---- os pinos ----
  // Cada feira vira um objeto leve com o que o resto do site usa (posicao e
  // "abrir o popup"); o desenho fica todo na camada "feiras" do mapa.
  var todos = [];
  FEIRAS.forEach(function (f) {
    if (f.lat == null || f.lng == null || f.lat === "" || f.lng === "") return;
    todos.push({
      feira: f, idx: todos.length, lat: +f.lat, lng: +f.lng,
      getLatLng: function () { return { lat: this.lat, lng: this.lng }; },
      openPopup: function () { abrePopup(this); }
    });
  });
  var visiveisAtuais = todos;
  function colecao(lista) {
    return {
      type: "FeatureCollection",
      features: lista.map(function (m) {
        return {
          type: "Feature", id: m.idx,
          geometry: { type: "Point", coordinates: [m.lng, m.lat] },
          properties: { pin: chavePin(m.feira) }
        };
      })
    };
  }
  function desenhaPinos() {
    var src = map.getSource("feiras");
    if (src) src.setData(colecao(visiveisAtuais));
  }

  // roda a cada carta carregada (a primeira e, se ela falhar, o fundo liso)
  map.on("style.load", function () {
    map.getStyle().layers.forEach(function (l) {
      if (l.type === "symbol" && ehPoiDaCarta(l.id)) map.removeLayer(l.id);
      // predios em 3D ao aproximar: chamavam mais atencao que as feiras e
      // tapavam pinos. Fica so a planta deles, plana (camada "building").
      else if (l.type === "fill-extrusion") map.removeLayer(l.id);
    });
    registraPinos();
    if (!map.getSource("feiras")) map.addSource("feiras", { type: "geojson", data: colecao(visiveisAtuais) });
    if (!map.getLayer("feiras")) {
      map.addLayer({
        id: "feiras", type: "symbol", source: "feiras",
        layout: {
          "icon-image": ["get", "pin"],
          "icon-anchor": "bottom",
          "icon-size": ["step", ["zoom"], ESCALA_PIN_AFASTADO, ZOOM_PINS_NORMAIS, 1],
          // todos os pinos sempre: nenhum some por estar colado a outro
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          // o pino mais ao sul fica por cima, como num mapa de papel
          "symbol-z-order": "viewport-y"
        }
      });
    }
  });

  // clique (ou toque) num pino abre o popup dele
  map.on("click", "feiras", function (e) {
    if (app.classList.contains("marcando") || !e.features.length) return;
    abrePopup(todos[e.features[0].id]);
  });

  // nome da feira ao passar o mouse (so onde ha mouse: no toque ele ficaria preso)
  var temMouse = window.matchMedia("(hover: hover)").matches;
  var dicaHover = new maplibregl.Popup({
    closeButton: false, closeOnClick: false, className: "dica-feira",
    anchor: "bottom", offset: [0, -PIN_H], maxWidth: "260px"
  });
  var pinoSobMouse = -1;
  map.on("mousemove", "feiras", function (e) {
    if (app.classList.contains("marcando") || !e.features.length) return;
    map.getCanvas().style.cursor = "pointer";
    var m = todos[e.features[0].id];
    if (!temMouse || m.idx === pinoSobMouse) return;
    pinoSobMouse = m.idx;
    if (popupAtual && popupAtual.m === m) { dicaHover.remove(); return; }
    dicaHover.setOffset([0, -PIN_H * escalaPins()])
      .setLngLat([m.lng, m.lat])
      .setHTML(esc(nomeFeira(m.feira)) + " · " + esc(m.feira.bairro))
      .addTo(map);
  });
  map.on("mouseleave", "feiras", function () {
    map.getCanvas().style.cursor = "";
    pinoSobMouse = -1;
    dicaHover.remove();
  });

  // indices p/ busca por area (bairro/distrito/zona) -> pinos daquela area
  var porBairro = {}, porDistrito = {}, porZona = {}, porId = {};
  todos.forEach(function (m) {
    var f = m.feira;
    porId[f.id] = m;
    if (f.bairro) (porBairro[f.bairro] = porBairro[f.bairro] || []).push(m);
    if (f.distrito) (porDistrito[f.distrito] = porDistrito[f.distrito] || []).push(m);
    var z = zonaDe(f);
    if (z) (porZona[z] = porZona[z] || []).push(m);
  });

  // O mapa acompanha o tamanho da PROPRIA area, nao so o da janela: no celular
  // ele nascia medido antes de o layout assentar (339px numa tela de 375) e
  // ficava uma faixa vazia na lateral, ate a janela mudar de tamanho.
  var zoomMinTimer;
  function ajustaTamanho() {
    // so quando o tamanho mudou de fato: redimensionar a tela do mapa apaga o
    // desenho, e sem pedir um novo quadro ele ficava em branco
    var area = document.getElementById("map"), tela = map.getCanvas();
    if (area.clientWidth === tela.clientWidth && area.clientHeight === tela.clientHeight) return;
    map.resize();
    map.triggerRepaint();
    clearTimeout(zoomMinTimer);
    zoomMinTimer = setTimeout(atualizarZoomMin, 200); // o "ver tudo" muda ao girar o celular
  }
  if (window.ResizeObserver) new ResizeObserver(ajustaTamanho).observe(document.getElementById("map"));
  window.addEventListener("resize", ajustaTamanho);
  // recolher/abrir a barra lateral anima a largura: mede de novo no fim
  document.getElementById("sidebar").addEventListener("transitionend", ajustaTamanho);
  map.once("load", function () {
    ajustaTamanho();
    // nasceu com o tamanho errado: re-enquadra a cidade, se ninguem moveu o mapa ainda
    if (limites && !userPos && !feiraPedida) map.fitBounds(limites, { duration: 0 });
    atualizarZoomMin();
  });
  atualizarZoomMin();

  // Creditos do mapa (o "i"): o MapLibre os abre sozinho ao carregar e so
  // recolhe quando a pessoa arrasta o mapa. Aqui nascem fechados e abrem so no
  // clique. Recolher = o mesmo que o MapLibre faz no arrasto (tirar a classe);
  // no "idle" porque a classe pode chegar depois do "load", com a carta.
  var creditoTocado = false; // quem ja abriu o "i" com a carta ainda chegando decide sozinho
  map.getContainer().addEventListener("click", function (e) {
    if (e.target.closest(".maplibregl-ctrl-attrib-button")) creditoTocado = true;
  });
  map.once("idle", function () {
    var c = document.querySelector(".maplibregl-ctrl-attrib.maplibregl-compact");
    if (c && !creditoTocado) c.classList.remove("maplibregl-compact-show");
  });

  // ---- toast (mensagens rapidas) ----
  var toastTimer;
  function toast(msg, ms) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, ms || 3200);
  }

  // ---- estado dos filtros ----
  var filtros = { dias: new Set(), categorias: new Set() };

  function passa(f) {
    if (filtros.dias.size && !filtros.dias.has(f.dia)) return false;
    if (filtros.categorias.size && !filtros.categorias.has(f.categoria)) return false;
    return true;
  }

  function aplicar() {
    var visiveis = todos.filter(function (m) { return passa(m.feira); });
    visiveisAtuais = visiveis;
    desenhaPinos();
    // o pino saiu do mapa: o popup dele nao fica boiando sozinho
    if (popupAtual && !passa(popupAtual.m.feira)) fechaPopup();
    document.getElementById("vazio").hidden = visiveis.length !== 0;
    if (userPos) renderListaPerto();
    atualizaRotuloFiltros();
    if (iniciado) {
      anuncia(visiveis.length === 1 ? "1 feira no mapa" : visiveis.length + " feiras no mapa");
      sincronizaEndereco();
    }
  }

  // true depois que a tela inicial esta montada: antes disso os filtros estao
  // sendo postos por codigo (inclusive os do endereco) e nao ha o que anunciar
  var iniciado = false;

  // ---- anuncio para leitor de tela ----
  // O mapa muda sem que nada perto do foco mude: quem nao enxerga a tela nao
  // saberia que o filtro surtiu efeito. A espera junta mudancas em sequencia
  // (ex.: "Feiras hoje" desliga um dia e liga outro) num anuncio so.
  var anuncioTimer;
  function anuncia(texto) {
    clearTimeout(anuncioTimer);
    anuncioTimer = setTimeout(function () {
      document.getElementById("anuncio").textContent = texto;
    }, 500);
  }

  // ---- filtros no endereco (?dia=domingo&categoria=organica) ----
  // O endereco acompanha os filtros: copiar o link (ou usar o "compartilhar" do
  // navegador) leva a outra pessoa a mesma vista. "hoje" nao vira um dia fixo:
  // quem abrir o link amanha ve as feiras do dia em que abriu.
  function slug(v) { return norm(String(v).replace(" Feira", "")); }
  var enderecoTimer;
  function sincronizaEndereco() {
    // adiado: um clique passa por mais de um ouvinte antes de o estado assentar
    clearTimeout(enderecoTimer);
    enderecoTimer = setTimeout(function () {
      var partes = [];
      if (document.getElementById("hoje").classList.contains("ativo")) partes.push("dia=hoje");
      else if (filtros.dias.size) partes.push("dia=" + Array.from(filtros.dias).map(slug).join(","));
      if (filtros.categorias.size) partes.push("categoria=" + Array.from(filtros.categorias).map(slug).join(","));
      try {
        history.replaceState(null, "", location.pathname + (partes.length ? "?" + partes.join("&") : ""));
      } catch (e) {} // file:// e alguns contextos embutidos recusam: o site segue sem o link
    }, 0);
  }
  function aplicarFiltrosDoEndereco(params) {
    function liga(containerId, valor) {
      var pedidos = String(valor || "").split(",").map(norm).filter(Boolean);
      if (!pedidos.length) return;
      sincronizando = true;
      document.querySelectorAll("#" + containerId + " .chip").forEach(function (c) {
        if (pedidos.indexOf(slug(c.dataset.valor)) !== -1 && !c.classList.contains("ativo")) c.click();
      });
      sincronizando = false;
    }
    if (norm(params.get("dia") || "") === "hoje") document.getElementById("hoje").click();
    else liga("filtro-dias", params.get("dia"));
    liga("filtro-categorias", params.get("categoria"));
  }

  // flag: true enquanto os chips sao clicados por codigo (nao pelo usuario)
  var sincronizando = false;
  function setBotaoAtivo(id, on) {
    var b = document.getElementById(id);
    b.classList.toggle("ativo", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  }

  // ---- monta controles ----
  function montaChips(containerId, valores, set, comCor, emojiMap, contagens) {
    var box = document.getElementById(containerId);
    valores.forEach(function (v) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.valor = v;
      chip.setAttribute("aria-pressed", "false");
      var top = document.createElement("span");
      top.className = "chip-top";
      // so texto, sem bolinha nem emoji: o chip ativo e que assume a cor do dia
      if (comCor) chip.style.setProperty("--chip-cor", corDia(v));
      var rotulo = v.replace(" Feira", "");
      top.appendChild(document.createTextNode(rotulo));
      chip.appendChild(top);
      if (contagens && contagens[v] != null) {
        var q = document.createElement("span");
        q.className = "qtd";
        q.textContent = contagens[v];
        chip.appendChild(q);
      }
      chip.addEventListener("click", function () {
        if (set.has(v)) { set.delete(v); chip.classList.remove("ativo"); chip.setAttribute("aria-pressed", "false"); }
        else { set.add(v); chip.classList.add("ativo"); chip.setAttribute("aria-pressed", "true"); }
        aplicar();
      });
      box.appendChild(chip);
    });
  }

  function contar(campo) {
    var c = {};
    FEIRAS.forEach(function (f) { c[f[campo]] = (c[f[campo]] || 0) + 1; });
    return c;
  }

  var diasPresentes = ORDEM_DIAS.filter(function (d) {
    return FEIRAS.some(function (f) { return f.dia === d; });
  });
  var categorias = Array.from(new Set(FEIRAS.map(function (f) { return f.categoria; }))).sort();

  montaChips("filtro-dias", diasPresentes, filtros.dias, true, null, contar("dia"));
  montaChips("filtro-categorias", categorias, filtros.categorias, false, emojiCat, contar("categoria"));

  // se o usuario mexer nos chips de dia manualmente, "Feiras hoje" deixa de valer
  document.getElementById("filtro-dias").addEventListener("click", function (e) {
    if (!sincronizando && e.target.closest(".chip")) { setBotaoAtivo("hoje", false); sincronizaEndereco(); }
  });

  // ---- busca com sugestoes clicaveis (rua, bairro, distrito, zona, etc.) ----
  var busca = document.getElementById("busca");
  var caixaSugestoes = document.getElementById("busca-sugestoes");
  var MAX_SUGESTOES = 8;
  var MAX_AREAS = 4;

  // navegacao por teclado nas sugestoes (setas + Enter)
  var idxRealce = -1;
  function opcoesSugestao() {
    return caixaSugestoes.querySelectorAll('li[role="option"]');
  }
  function setRealce(i) {
    var itens = opcoesSugestao();
    if (idxRealce >= 0 && itens[idxRealce]) itens[idxRealce].classList.remove("realce");
    idxRealce = i;
    if (i >= 0 && itens[i]) {
      itens[i].classList.add("realce");
      itens[i].scrollIntoView({ block: "nearest" });
      busca.setAttribute("aria-activedescendant", itens[i].id);
    } else {
      busca.removeAttribute("aria-activedescendant");
    }
  }

  function buscarFeiras(termo) {
    var q = norm(termo.trim());
    if (!q) return [];
    var resultados = [];
    todos.forEach(function (m) {
      var f = m.feira;
      // join() converte null/undefined em "" (evita casar a palavra "null")
      var alvo = norm([f.logradouro, f.bairro, f.subprefeitura, f.distrito, zonaDe(f)].join(" "));
      var pos = alvo.indexOf(q);
      if (pos === -1) return;
      resultados.push({ m: m, f: f, pos: pos, comecaComRua: norm(f.logradouro).indexOf(q) === 0, fuzzy: false });
    });
    // nada bateu exato -> tenta tolerando erro de digitacao (so entao, pra
    // nao competir/confundir com os resultados exatos, que sao mais confiaveis)
    if (!resultados.length) {
      todos.forEach(function (m) {
        var f = m.feira;
        var alvo = norm([f.logradouro, f.bairro, f.subprefeitura, f.distrito, zonaDe(f)].join(" "));
        var d = distanciaFuzzyMin(q, alvo);
        if (d === null) return;
        resultados.push({ m: m, f: f, pos: 0, comecaComRua: false, fuzzy: true, dist: d });
      });
    }
    resultados.sort(function (a, b) {
      if (a.fuzzy !== b.fuzzy) return a.fuzzy ? 1 : -1;
      if (a.fuzzy) return a.dist - b.dist;
      if (a.comecaComRua !== b.comecaComRua) return a.comecaComRua ? -1 : 1;
      if (a.pos !== b.pos) return a.pos - b.pos;
      return a.f.logradouro.localeCompare(b.f.logradouro, "pt-BR");
    });
    return resultados.slice(0, MAX_SUGESTOES);
  }

  // zonas, distritos e bairros que batem com o termo -> "atalho" p/ ver a area toda
  function buscarAreas(termo) {
    var q = norm(termo.trim());
    if (!q) return [];
    var areas = [];
    function addTipo(tipo, rotulo, mapa) {
      Object.keys(mapa).forEach(function (label) {
        if (norm(label).indexOf(q) !== -1) {
          areas.push({ tipo: rotulo, label: label, marcadores: mapa[label] });
        }
      });
    }
    addTipo("zona", "Zona", porZona);
    addTipo("distrito", "Distrito", porDistrito);
    addTipo("bairro", "Bairro", porBairro);
    if (!areas.length) {
      function addTipoFuzzy(rotulo, mapa) {
        Object.keys(mapa).forEach(function (label) {
          var d = distanciaFuzzyMin(q, norm(label));
          if (d !== null) areas.push({ tipo: rotulo, label: label, marcadores: mapa[label], dist: d });
        });
      }
      addTipoFuzzy("Zona", porZona);
      addTipoFuzzy("Distrito", porDistrito);
      addTipoFuzzy("Bairro", porBairro);
      areas.sort(function (a, b) { return a.dist - b.dist; });
      return areas.slice(0, MAX_AREAS);
    }
    areas.sort(function (a, b) { return b.marcadores.length - a.marcadores.length; });
    return areas.slice(0, MAX_AREAS);
  }

  function fecharSugestoes() {
    caixaSugestoes.hidden = true;
    caixaSugestoes.innerHTML = "";
    busca.setAttribute("aria-expanded", "false");
    idxRealce = -1;
    busca.removeAttribute("aria-activedescendant");
  }

  function irParaFeira(m) {
    irPara(m.lat, m.lng, ZOOM_LOCALIZACAO, true);
    m.openPopup();
    fecharSugestoes();
    busca.value = m.feira.logradouro;
    fechaGaveta();
  }

  function irParaArea(area) {
    enquadra(area.marcadores.map(function (m) { return m.getLatLng(); }), 0.15);
    fecharSugestoes();
    busca.value = area.label;
    fechaGaveta();
  }

  function mostrarSugestoes(termo) {
    var areas = buscarAreas(termo);
    var resultados = buscarFeiras(termo);
    caixaSugestoes.innerHTML = "";
    idxRealce = -1;
    busca.removeAttribute("aria-activedescendant");
    var seq = 0;
    if (!areas.length && !resultados.length) {
      if (!norm(termo.trim())) { fecharSugestoes(); return; }
      var vazio = document.createElement("li");
      vazio.className = "vazio";
      vazio.textContent = "Nenhuma feira encontrada";
      caixaSugestoes.appendChild(vazio);
      caixaSugestoes.hidden = false;
      busca.setAttribute("aria-expanded", "true");
      return;
    }
    areas.forEach(function (a, i) {
      var li = document.createElement("li");
      li.className = "area" + (i === areas.length - 1 && resultados.length ? " divisor" : "");
      li.id = "busca-opcao-" + (seq++);
      li.setAttribute("role", "option");
      li.innerHTML =
        '<span class="lp-info"><span class="lp-nome">' + esc(a.label) + "</span>" +
        '<span class="lp-sub">' + a.tipo + " · " + a.marcadores.length + " feira" + (a.marcadores.length > 1 ? "s" : "") + "</span></span>";
      li.addEventListener("click", function () { irParaArea(a); });
      caixaSugestoes.appendChild(li);
    });
    resultados.forEach(function (r) {
      var f = r.f;
      var li = document.createElement("li");
      li.id = "busca-opcao-" + (seq++);
      li.setAttribute("role", "option");
      li.innerHTML =
        '<span class="lp-info"><span class="lp-nome">' + esc(nomeFeira(f)) + "</span>" +
        '<span class="lp-sub">' + esc(f.bairro) + " · " + esc(f.dia.replace(" Feira", "")) + "</span></span>";
      li.addEventListener("click", function () { irParaFeira(r.m); });
      caixaSugestoes.appendChild(li);
    });
    caixaSugestoes.hidden = false;
    busca.setAttribute("aria-expanded", "true");
  }

  var t;
  busca.addEventListener("input", function () {
    clearTimeout(t);
    var v = this.value;
    t = setTimeout(function () { mostrarSugestoes(v); }, 180);
  });
  busca.addEventListener("focus", function () {
    if (this.value.trim()) mostrarSugestoes(this.value);
  });
  busca.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { fecharSugestoes(); this.blur(); return; }
    if (caixaSugestoes.hidden) return;
    var itens = opcoesSugestao();
    if (!itens.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setRealce((idxRealce + 1) % itens.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setRealce((idxRealce - 1 + itens.length) % itens.length); }
    else if (e.key === "Enter") { e.preventDefault(); itens[idxRealce >= 0 ? idxRealce : 0].click(); }
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".busca-wrap")) fecharSugestoes();
  });

  function limparTudo() {
    filtros.dias.clear(); filtros.categorias.clear();
    busca.value = "";
    fecharSugestoes();
    document.querySelectorAll(".chip.ativo").forEach(function (c) {
      c.classList.remove("ativo");
      c.setAttribute("aria-pressed", "false");
    });
    setBotaoAtivo("hoje", false);
    aplicar();
  }
  document.getElementById("vazio-limpar").addEventListener("click", limparTudo);

  // ---- feiras de hoje (toggle) ----
  document.getElementById("hoje").addEventListener("click", function () {
    var ativo = this.classList.contains("ativo");
    // limpa os dias atuais (por codigo, sem desligar o proprio botao)
    sincronizando = true;
    document.querySelectorAll("#filtro-dias .chip.ativo").forEach(function (c) { c.click(); });
    sincronizando = false;

    if (ativo) {                      // estava ligado -> desliga
      setBotaoAtivo("hoje", false);
      aplicar();
      return;
    }
    var hoje = NOMES_JS[new Date().getDay()];
    var chip = document.querySelector('#filtro-dias .chip[data-valor="' + hoje + '"]');
    if (!chip) {
      toast("Hoje (" + hoje.split(" ")[0] + ") não tem feira — planeje a de amanhã! 😉");
      return;
    }
    sincronizando = true;
    chip.click();                     // ativa so o dia de hoje
    sincronizando = false;
    setBotaoAtivo("hoje", true);
    sincronizaEndereco();
    toast("🗓️ Mostrando as feiras de hoje (" + hoje + ")");
  });

  // ---- perto de mim (toggle) ----
  var userMarker = null, userPos = null;
  function distKm(la1, lo1, la2, lo2) {
    var R = 6371, rad = Math.PI / 180;
    var dLa = (la2 - la1) * rad, dLo = (lo2 - lo1) * rad;
    var a = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
            Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function fmtDist(km) {
    return km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1).replace(".", ",") + " km";
  }
  var painel = document.getElementById("lista-perto");
  var lpItens = document.getElementById("lp-itens");
  var lpTitulo = document.getElementById("lp-titulo");
  var lpCab = document.getElementById("lp-cabecalho");
  var btnLpMin = document.getElementById("lp-min");
  var RAIO = 2; // km considerado "perto"
  var MAX_LISTA = 30;
  var ZOOM_LOCALIZACAO = 14; // (escala do MapLibre) mesmo zoom usado ao achar a localizacao e ao focar um item da lista
  var LONGE_KM = 30; // feira mais proxima alem disso: a pessoa esta fora da regiao

  function feiraMaisProximaKm(lat, lng) {
    var min = Infinity;
    todos.forEach(function (m) {
      var p = m.getLatLng(), d = distKm(lat, lng, p.lat, p.lng);
      if (d < min) min = d;
    });
    return min;
  }

  // leva o mapa ate a feira e abre o popup dela (itens da lista e link compartilhado)
  function focarFeira(m) {
    irPara(m.lat, m.lng, ZOOM_LOCALIZACAO, true);
    m.openPopup();
    fechaGaveta();
    if (folhaAtiva()) poeFolha(0); // no celular a lista recolhe pra feira aparecer no mapa
  }

  function itemLista(x) {
    var f = x.f;
    var li = document.createElement("li");
    // alcancavel pelo teclado: so com o clique, a lista era invisivel pra quem nao usa mouse
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.innerHTML =
      // sem o emoji do tipo no nome: ele empurrava o texto e desalinhava a
      // lista. O tipo so aparece quando foge da regra (929 de 975 sao tradicionais).
      '<span class="lp-info"><span class="lp-nome">' + esc(nomeFeira(f)) + "</span>" +
      '<span class="lp-sub">' + [f.bairro, f.dia.replace(" Feira", ""), f.categoria === "Tradicional" ? "" : f.categoria]
        .filter(Boolean).map(esc).join(" · ") + "</span></span>" +
      '<span class="lp-dist">' + fmtDist(x.d) + "</span>";
    li.addEventListener("click", function () { focarFeira(x.m); });
    li.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); focarFeira(x.m); }
    });
    return li;
  }

  function renderListaPerto() {
    if (!userPos) { painel.hidden = true; return; }
    var arr = [];
    todos.forEach(function (m) {
      if (!passa(m.feira)) return;
      var p = m.getLatLng();
      arr.push({ m: m, f: m.feira, d: distKm(userPos.lat, userPos.lng, p.lat, p.lng) });
    });
    arr.sort(function (a, b) { return a.d - b.d; });
    var dentro = arr.filter(function (x) { return x.d <= RAIO; }).length;
    lpTitulo.innerHTML = dentro
      ? "<span class=\"lp-emoji\">🧺 </span>Feiras até " + RAIO + " km <span class=\"lp-qtd\">" + dentro + "</span>"
      : "Nenhuma feira em " + RAIO + " km — veja as mais próximas:";

    lpItens.innerHTML = "";
    arr.slice(0, MAX_LISTA).forEach(function (x) { lpItens.appendChild(itemLista(x)); });

    var estavaOculto = painel.hidden;
    painel.hidden = false;
    if (estavaOculto) poeFolha(1);
  }

  // ---- a folha do celular ----
  // No celular a lista "perto" e uma folha presa ao rodape, com tres paradas:
  // recolhida (so o cabecalho, mapa quase inteiro a mostra), a de sempre e
  // aberta (leitura). Arrasta-se so pelo cabecalho, de proposito: assim o gesto
  // nunca disputa com a rolagem da lista. No computador nao ha folha: as mesmas
  // paradas 0 e 1 viram o minimizar/expandir de sempre.
  var mqEstreito = window.matchMedia("(max-width: 760px)");
  // A parada vigente e GUARDADA, e nao medida: medir a altura no meio da
  // transicao devolve a altura antiga, e o toque seguinte decidia errado.
  var paradaFolha = 1;
  function folhaAtiva() { return mqEstreito.matches && !painel.hidden; }
  function alturasFolha() {
    var H = window.innerHeight;
    var media = Math.round(H * 0.45);
    // a recolhida e a altura do proprio cabecalho, medida: acompanha a fonte
    return [lpCab.offsetHeight, media, Math.max(media, H - 130)];
  }
  function poeFolha(i) {
    paradaFolha = i;
    var min = i === 0;
    painel.classList.toggle("minimizado", min);
    btnLpMin.textContent = min ? "+" : "–";
    btnLpMin.setAttribute("aria-label", min ? "Expandir lista" : "Minimizar lista");
    painel.style.height = mqEstreito.matches ? alturasFolha()[i] + "px" : "";
    alturaCredito();
  }
  // o credito do mapa (rodape) fica logo acima da folha, nunca escondido por ela
  function alturaCredito(h) {
    var v = folhaAtiva() ? (h != null ? h : alturasFolha()[paradaFolha]) : 0;
    document.documentElement.style.setProperty("--folha-h", v + "px");
  }
  btnLpMin.addEventListener("click", function () { poeFolha(paradaFolha === 0 ? 1 : 0); });

  var arrasto = null;
  lpCab.addEventListener("pointerdown", function (e) {
    if (!mqEstreito.matches || e.target.closest("#lp-min")) return;
    arrasto = { y: e.clientY, h: painel.offsetHeight, moveu: false };
    try { lpCab.setPointerCapture(e.pointerId); } catch (err) {}
    painel.classList.add("arrastando");
  });
  lpCab.addEventListener("pointermove", function (e) {
    if (!arrasto) return;
    var dy = arrasto.y - e.clientY;
    if (Math.abs(dy) > 6) arrasto.moveu = true;
    var a = alturasFolha();
    var h = Math.min(a[2], Math.max(a[0], arrasto.h + dy));
    painel.style.height = h + "px";
    alturaCredito(h);
  });
  function soltaFolha() {
    if (!arrasto) return;
    var moveu = arrasto.moveu;
    arrasto = null;
    painel.classList.remove("arrastando");
    if (!moveu) { poeFolha(paradaFolha === 0 ? 1 : 0); return; } // toque simples: abre/recolhe
    var h = painel.offsetHeight, a = alturasFolha(), perto = 0;
    a.forEach(function (v, i) { if (Math.abs(v - h) < Math.abs(a[perto] - h)) perto = i; });
    poeFolha(perto);
  }
  lpCab.addEventListener("pointerup", soltaFolha);
  lpCab.addEventListener("pointercancel", soltaFolha);
  // girar o aparelho ou cruzar o ponto de quebra muda as alturas das paradas
  window.addEventListener("resize", function () { if (!painel.hidden) poeFolha(paradaFolha); });

  function desligarPerto() {
    if (userMarker) { userMarker.remove(); userMarker = null; }
    userPos = null;
    painel.hidden = true;
    poeFolha(1);
    setBotaoAtivo("perto", false);
    btnVoltarLoc.classList.remove("ativo");
    btnVoltarLoc.setAttribute("aria-label", "Ver as feiras perto de mim");
  }

  // botao redondo do mapa: com a localizacao desligada ELE tambem a liga;
  // com ela ligada, volta a centralizar no usuario.
  var btnVoltarLoc = document.getElementById("voltar-localizacao");
  btnVoltarLoc.addEventListener("click", function () {
    fecharDica();
    if (userPos) { irPara(userPos.lat, userPos.lng, ZOOM_LOCALIZACAO); return; }
    ativarPerto(false);
  });

  var btnPerto = document.getElementById("perto");
  var lblPerto = btnPerto.querySelector(".acao-label");
  function ativarPerto(auto) {
    if (!navigator.geolocation) { if (!auto) toast("Seu navegador não suporta geolocalização"); return; }
    btnPerto.disabled = true; lblPerto.textContent = "Localizando…";
    navigator.geolocation.getCurrentPosition(function (pos) {
      btnPerto.disabled = false; lblPerto.textContent = "Perto de mim";
      // Fora da capital a lista viraria "2461 km" e o mapa pararia na borda dos
      // limites, sem a pessoa nem feira nenhuma a vista. Nenhum ponto da cidade
      // fica a mais de ~20 km de uma feira (o pior e a ponta sul de Marsilac),
      // e a Grande SP fica abaixo de 30 km: so quem esta longe cai aqui.
      if (feiraMaisProximaKm(pos.coords.latitude, pos.coords.longitude) > LONGE_KM) {
        if (userPos) desligarPerto();
        if (dlgConvite.open) fechaDialogo(dlgConvite, "ligada");
        // quem abre o site com a permissao ja dada nao precisa ouvir isso a cada visita
        if (!auto) toast("Parece que você está fora de São Paulo. Este mapa mostra só as feiras livres da capital.", 6000);
        return;
      }
      setBotaoAtivo("perto", true);
      userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (userMarker) userMarker.remove();
      userMarker = marcadorDe("user-dot", userPos.lat, userPos.lng);
      // quem chegou por um link de feira quer ver AQUELA feira: a lista de
      // distancias aparece, mas o mapa nao sai de cima dela
      if (!feiraPedida) irPara(userPos.lat, userPos.lng, ZOOM_LOCALIZACAO);
      renderListaPerto();
      btnVoltarLoc.classList.add("ativo");
      btnVoltarLoc.setAttribute("aria-label", "Voltar para minha localização");
      fecharDica();
      // a posicao chegou com o convite ainda aberto: nao ha mais o que perguntar
      if (dlgConvite.open) fechaDialogo(dlgConvite, "ligada");
    }, function () {
      btnPerto.disabled = false; lblPerto.textContent = "Perto de mim";
      if (!auto) toast("Não foi possível obter sua localização");
    }, { timeout: 8000, enableHighAccuracy: false, maximumAge: 60000 });
  }
  btnPerto.addEventListener("click", function () {
    if (this.classList.contains("ativo")) { desligarPerto(); return; }
    ativarPerto(false);
  });

  // Quem JA concedeu a permissao antes e ligado direto (o navegador nao pergunta
  // nada e o site abre centralizado). Quem nunca decidiu NAO recebe a janela do
  // navegador no load: o "nao" fica gravado quase pra sempre, e negar por reflexo
  // no segundo zero queimaria a funcao. Esses recebem o NOSSO convite (mais
  // abaixo), e a janela do navegador so aparece para quem aceitou.
  var geoNegada = false;
  function pedirLocalizacaoNoInicio() {
    if (!navigator.geolocation) return;
    if (!(navigator.permissions && navigator.permissions.query)) return;
    navigator.permissions.query({ name: "geolocation" })
      .then(function (p) {
        if (p.state === "granted") ativarPerto(true);
        else if (p.state === "denied") geoNegada = true;
      })
      .catch(function () {});
  }

  // ---- gaveta de filtros (celular) ----
  // No celular a busca e os dois atalhos ficam sempre a vista, no topo; os
  // filtros de dia e categoria abrem por este botao.
  var app = document.getElementById("app");
  var btnToggle = document.getElementById("toggle-sidebar");
  function poeGaveta(aberta) {
    app.classList.toggle("sidebar-aberta", aberta);
    btnToggle.setAttribute("aria-expanded", aberta ? "true" : "false");
  }
  function fechaGaveta() { poeGaveta(false); }
  btnToggle.addEventListener("click", function () { poeGaveta(!app.classList.contains("sidebar-aberta")); });
  map.on("click", fechaGaveta);
  // com a gaveta fechada os filtros ligados nao aparecem: o botao conta quantos sao
  // ---- onde mora a lista "perto" ----
  // No computador ela ocupa o vao da barra lateral, entre os filtros e o
  // rodape: o mapa fica livre e a lista fica junto dos filtros que a mudam.
  // No celular ela e a folha presa ao pe da tela. O mesmo elemento muda de
  // lugar (os ouvintes vao junto) quando a tela cruza o ponto de quebra.
  var rodapeBarra = document.querySelector("#sidebar footer");
  var antesDoToast = document.getElementById("toast");
  function posicionaLista() {
    if (mqEstreito.matches) {
      if (painel.parentNode !== app) app.insertBefore(painel, antesDoToast);
    } else if (painel.nextElementSibling !== rodapeBarra) {
      rodapeBarra.parentNode.insertBefore(painel, rodapeBarra);
    }
    if (!painel.hidden) poeFolha(paradaFolha);
  }
  if (mqEstreito.addEventListener) mqEstreito.addEventListener("change", posicionaLista);
  else mqEstreito.addListener(posicionaLista); // Safari antigo
  posicionaLista();

  function atualizaRotuloFiltros() {
    var n = filtros.dias.size + filtros.categorias.size;
    btnToggle.textContent = "☰ Filtros" + (n ? " · " + n : "");
  }

  var btnColapsar = document.getElementById("colapsar-sidebar");
  btnColapsar.addEventListener("click", function () {
    fecharDica(); // com a barra recolhida o "Perto de mim" some, e a dica ficaria orfa
    var colapsada = app.classList.toggle("sidebar-colapsada");
    btnColapsar.textContent = colapsada ? "›" : "‹";
    btnColapsar.setAttribute("aria-label", colapsada ? "Expandir filtros" : "Colapsar filtros");
  });

  // ---- janelas (<dialog>) ----
  function abreDialogo(d) {
    if (d.open) return;
    if (d.showModal) d.showModal();
    else d.setAttribute("open", ""); // navegador antigo: abre sem o veu
  }
  function fechaDialogo(d, valor) {
    if (d.close) d.close(valor);
    else { d.removeAttribute("open"); d.dispatchEvent(new Event("close")); }
  }
  // Clique no veu fecha; clique dentro da caixa nao. Comparar e.target com o
  // dialog NAO basta: o preenchimento da caixa pertence ao proprio <dialog>.
  // O que separa os dois e a geometria.
  function fechaNoVeu(d) {
    d.addEventListener("click", function (e) {
      if (e.target !== d) return;
      var r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) fechaDialogo(d);
    });
  }

  // ---- aviso sobre a qualidade dos dados (uma vez por navegador) ----
  // Mostrar a cada visita puniria justamente quem volta — e quem volta ja leu.
  var CHAVE_AVISO = "feirasp:aviso-dados";
  var dlgAviso = document.getElementById("aviso-dados");
  function jaViuAviso() {
    try { return localStorage.getItem(CHAVE_AVISO) === "1"; } catch (e) { return false; }
  }
  function mostrarAvisoDados(depois) {
    // 'close' cobre os tres caminhos de saida: o botao, o Esc e o clique no veu
    dlgAviso.addEventListener("close", function () {
      // modo privado do Safari lanca ao gravar: nesse caso o aviso volta na proxima visita
      try { localStorage.setItem(CHAVE_AVISO, "1"); } catch (e) {}
      depois();
    }, { once: true });
    abreDialogo(dlgAviso);
  }
  document.getElementById("aviso-ok").addEventListener("click", function () { fechaDialogo(dlgAviso); });
  fechaNoVeu(dlgAviso);

  // ---- convite para ligar a localizacao ----
  // A cada visita, logo depois do aviso (ou no lugar dele, para quem ja leu).
  // Aceitar e que dispara a janela do navegador; recusar — aqui ou la — deixa a
  // dica apontando o botao, para a pessoa saber onde ligar depois. Se o
  // navegador ja tem a resposta, perguntar de novo seria so um obstaculo:
  // permitida, liga direto (pedirLocalizacaoNoInicio); negada, nao insiste.
  // "Visita" e a sessao da aba: ir a lista e voltar nao pergunta de novo.
  var CHAVE_CONVITE = "feirasp:convite-localizacao";
  var dlgConvite = document.getElementById("convite-localizacao");
  function conviteJaFeito() {
    try { return sessionStorage.getItem(CHAVE_CONVITE) === "1"; } catch (e) { return false; }
  }
  function convidarLocalizacao() {
    // quem chega por um link de feira quer ver AQUELA feira, nao outra tela
    if (userPos || feiraPedida || geoNegada || !navigator.geolocation || conviteJaFeito()) return;
    function abre() {
      if (userPos) return; // a posicao chegou enquanto a permissao era consultada
      try { sessionStorage.setItem(CHAVE_CONVITE, "1"); } catch (e) {}
      dlgConvite.returnValue = "";
      abreDialogo(dlgConvite);
    }
    if (!(navigator.permissions && navigator.permissions.query)) { abre(); return; } // sem a API (Safari antigo), pergunta
    navigator.permissions.query({ name: "geolocation" })
      .then(function (p) { if (p.state === "prompt") abre(); })
      .catch(abre);
  }
  document.getElementById("convite-sim").addEventListener("click", function () { fechaDialogo(dlgConvite, "sim"); });
  document.getElementById("convite-nao").addEventListener("click", function () { fechaDialogo(dlgConvite, "nao"); });
  fechaNoVeu(dlgConvite);
  dlgConvite.addEventListener("close", function () {
    // Esc e clique no veu chegam com returnValue vazio: tambem e recusa.
    // "ligada" e o convite fechado pela propria posicao: nao ha dica a dar.
    if (dlgConvite.returnValue === "sim") ativarPerto(false);
    else if (dlgConvite.returnValue !== "ligada") mostrarDicaLocalizacao();
  });

  // ---- dica apontando pro botao "Perto de mim" (depois de recusar o convite) ----
  var dicaTimer;
  function fecharDica() {
    var d = document.getElementById("dica-localizacao");
    if (d.hidden) return;
    clearTimeout(dicaTimer);
    d.classList.remove("show");
    setTimeout(function () { d.hidden = true; }, 260);
  }
  // no computador a caixa fica a direita do botao, sobre o mapa; no celular o
  // botao esta na barra do topo, e a caixa vai logo abaixo dele.
  function noDesktop() { return !mqEstreito.matches; }
  function posicionarDica(d) {
    var desktop = noDesktop();
    var r = btnPerto.getBoundingClientRect();
    if (!r.width) { fecharDica(); return; } // barra lateral recolhida: nao ha alvo
    d.querySelector("span").textContent =
      (desktop ? "Clique" : "Toque") + " aqui para ver as feiras perto de você";
    d.classList.remove("seta-esq", "seta-cima");
    d.style.right = "auto";
    if (desktop) {
      d.style.left = Math.round(r.right + 12) + "px";
      d.style.top = Math.round(r.top + r.height / 2 - d.offsetHeight / 2) + "px";
      d.classList.add("seta-esq");
    } else {
      d.style.left = Math.round(Math.max(12, r.left + r.width / 2 - d.offsetWidth / 2)) + "px";
      d.style.top = Math.round(r.bottom + 12) + "px";
      d.classList.add("seta-cima");
    }
  }
  function mostrarDicaLocalizacao() {
    if (userPos || geoNegada) return; // ja localizado, ou negou: a dica so frustraria
    var d = document.getElementById("dica-localizacao");
    d.hidden = false;      // precisa estar visivel pra medir no posicionamento
    posicionarDica(d);
    void d.offsetWidth;
    d.classList.add("show");
    dicaTimer = setTimeout(fecharDica, 9000);
  }
  document.getElementById("dica-fechar").addEventListener("click", fecharDica);
  map.on("click", fecharDica);
  map.on("dragstart", fecharDica); // interagiu com o mapa: ja se virou sozinho
  // reposiciona depois que o layout assenta (girar o celular troca o formato,
  // e medir cedo demais pega a largura antiga)
  var dicaPosTimer;
  window.addEventListener("resize", function () {
    var d = document.getElementById("dica-localizacao");
    if (d.hidden) return;
    clearTimeout(dicaPosTimer);
    dicaPosTimer = setTimeout(function () { posicionarDica(d); }, 200);
  });

  // ---- reportar erro de uma feira ----
  // O envio fica registrado para conferencia a mao (functions/api/report.js):
  // nada muda no mapa sozinho. Ver README, "Conferência dos reports".
  var dlgReporte = document.getElementById("reporte");
  var formReporte = document.getElementById("reporte-form");
  var msgReporte = document.getElementById("reporte-msg");
  var boxPonto = document.getElementById("reporte-ponto");
  var statusPonto = document.getElementById("reporte-ponto-status");
  var btnMarcar = document.getElementById("reporte-marcar");
  var btnEnviar = document.getElementById("reporte-enviar");
  var btnCancelarReporte = document.getElementById("reporte-cancelar");
  var barraMarcar = document.getElementById("marcar-barra");
  var feiraReportada = null, pontoSugerido = null, marcadorSugerido = null;

  function tipoEscolhido() {
    var r = formReporte.querySelector('input[name="tipo"]:checked');
    return r ? r.value : "";
  }
  function limpaPontoSugerido() {
    pontoSugerido = null;
    if (marcadorSugerido) { marcadorSugerido.remove(); marcadorSugerido = null; }
    statusPonto.textContent = "";
    btnMarcar.textContent = "📍 Marcar o ponto certo no mapa";
  }
  function mensagemReporte(texto, erro) {
    msgReporte.textContent = texto;
    msgReporte.className = "reporte-msg" + (texto ? (erro ? " erro" : " ok") : "");
  }
  function abrirReporte(f) {
    feiraReportada = f;
    formReporte.reset();
    limpaPontoSugerido();
    mensagemReporte("");
    boxPonto.hidden = true;
    btnEnviar.disabled = false; btnEnviar.hidden = false;
    btnCancelarReporte.textContent = "Cancelar";
    document.getElementById("reporte-feira").textContent =
      [nomeFeira(f), f.bairro, f.dia].filter(Boolean).join(" · ");
    fechaPopup();
    dlgReporte.returnValue = "";
    abreDialogo(dlgReporte);
  }
  // marcar o ponto so faz sentido quando o erro e o lugar do pino
  formReporte.addEventListener("change", function (e) {
    if (e.target.name !== "tipo") return;
    boxPonto.hidden = tipoEscolhido() !== "local_errado";
    if (boxPonto.hidden) limpaPontoSugerido();
  });

  // Marcar no mapa: a janela sai da frente, a pessoa toca no ponto certo e a
  // janela volta com o que ja estava preenchido. Enquanto isso os pinos deixam
  // o toque passar (CSS, #app.marcando): o ponto certo costuma ficar colado a
  // outro pino, e o toque abriria o popup dele em vez de marcar.
  function pararMarcacao() {
    app.classList.remove("marcando");
    barraMarcar.hidden = true;
    map.off("click", aoMarcar);
  }
  function aoMarcar(e) {
    pontoSugerido = { lat: e.lngLat.lat, lng: e.lngLat.lng };
    if (marcadorSugerido) marcadorSugerido.remove();
    marcadorSugerido = marcadorDe("ponto-sugerido", pontoSugerido.lat, pontoSugerido.lng);
    statusPonto.textContent = "Ponto marcado ✓";
    btnMarcar.textContent = "📍 Marcar outro ponto";
    pararMarcacao();
    abreDialogo(dlgReporte);
  }
  btnMarcar.addEventListener("click", function () {
    var f = feiraReportada;
    fechaDialogo(dlgReporte, "marcar");
    fechaGaveta();
    app.classList.add("marcando");
    barraMarcar.hidden = false;
    fechaPopup();
    irPara(+f.lat, +f.lng, Math.max(map.getZoom(), 16));
    map.on("click", aoMarcar);
  });
  document.getElementById("marcar-cancelar").addEventListener("click", function () {
    pararMarcacao();
    abreDialogo(dlgReporte);
  });
  btnCancelarReporte.addEventListener("click", function () { fechaDialogo(dlgReporte, ""); });
  dlgReporte.addEventListener("close", function () {
    // fechada so para marcar o ponto: o que foi preenchido continua valendo
    if (dlgReporte.returnValue === "marcar") { dlgReporte.returnValue = ""; return; }
    limpaPontoSugerido();
  });

  formReporte.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = feiraReportada;
    var tipo = tipoEscolhido();
    var texto = document.getElementById("reporte-detalhe").value.trim();
    if (!tipo) { mensagemReporte("Escolha o que está errado.", true); return; }
    if (tipo === "outro" && !texto) { mensagemReporte("Conte em poucas palavras qual é o problema.", true); return; }

    var fd = new FormData();
    fd.append("feira", f.id);
    fd.append("nome", [nomeFeira(f), f.bairro, f.dia].filter(Boolean).join(" · "));
    fd.append("tipo", tipo);
    fd.append("texto", texto);
    fd.append("lat", f.lat);   // onde o pino estava, nao sugestao
    fd.append("lon", f.lng);
    if (tipo === "local_errado" && pontoSugerido) {
      fd.append("lat_sugerida", pontoSugerido.lat.toFixed(6));
      fd.append("lon_sugerida", pontoSugerido.lng.toFixed(6));
    }

    btnEnviar.disabled = true;
    mensagemReporte("Enviando…");
    fetch("/api/report", { method: "POST", body: fd })
      .then(function (r) {
        // resposta que nao e JSON (pagina de erro, rota ausente) cai no aviso generico
        return r.json().catch(function () { return {}; }).then(function (d) {
          return { ok: r.ok && d.ok === true, erro: d.erro };
        });
      })
      .then(function (res) {
        if (!res.ok) {
          var motivo = res.erro
            ? res.erro.charAt(0).toUpperCase() + res.erro.slice(1) + "."
            : "Não foi possível enviar agora. Tente de novo em instantes.";
          mensagemReporte(motivo, true);
          btnEnviar.disabled = false;
          return;
        }
        mensagemReporte("Obrigado! O report foi registrado e será conferido.");
        btnEnviar.hidden = true;
        btnCancelarReporte.textContent = "Fechar";
      })
      .catch(function () {
        mensagemReporte("Sem conexão. Tente de novo em instantes.", true);
        btnEnviar.disabled = false;
      });
  });

  // ---- partida ----
  // data da base (gerada junto com os dados): o rodape ja traz o texto fixo,
  // que so e trocado se o arquivo de dados trouxer outra data
  if (window.FEIRAS_BASE) {
    var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    var pedacos = String(window.FEIRAS_BASE).split("-");
    if (MESES[+pedacos[1] - 1]) document.getElementById("data-base").textContent = MESES[+pedacos[1] - 1] + " de " + pedacos[0];
  }

  var paramsIniciais = new URLSearchParams(location.search);
  var idPedido = paramsIniciais.get("feira");
  var feiraPedida = (idPedido && porId[idPedido]) || null;

  aplicarFiltrosDoEndereco(paramsIniciais);
  aplicar();
  iniciado = true;

  if (feiraPedida) {
    // Link compartilhado: abre direto naquela feira, sem filtro nenhum (um
    // filtro vindo junto poderia esconder justamente o pino dela). O parametro
    // sai do endereco depois de usado, para recarregar nao reabrir o popup.
    limparTudo();
    setTimeout(function () { focarFeira(feiraPedida); }, 320); // depois do enquadramento inicial
  } else if (idPedido) {
    sincronizaEndereco();
    toast("Essa feira não foi encontrada — o link pode ser antigo.");
  }

  // espera o mapa desenhar pra nao competir com a montagem da tela
  setTimeout(function () {
    if (jaViuAviso()) convidarLocalizacao();
    else mostrarAvisoDados(convidarLocalizacao);
  }, 1400);

  // quem ja deu a permissao antes abre com a localizacao ligada
  pedirLocalizacaoNoInicio();
})();
