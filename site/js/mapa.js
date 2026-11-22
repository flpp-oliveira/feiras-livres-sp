// O mapa: a carta, os pinos, a ficha (popup) de cada feira, a dica ao passar
// o mouse, os movimentos e o tamanho. Só este arquivo fala com o MapLibre; as
// outras partes pedem coisas ao mapa pelas funções exportadas aqui.

import { esc, campo, maiuscula } from "./texto.js?v=74";
import { emojiCat, corDia, nomeFeira, horarioDe } from "./dados.js?v=74";
import { limitesDe } from "./geo.js?v=74";
import { estado, avisar } from "./estado.js?v=74";
import { mqEstreito, semMovimento, temMouse } from "./pagina.js?v=74";

// mesmo zoom usado ao achar a localizacao e ao focar uma feira (escala do MapLibre)
export var ZOOM_LOCALIZACAO = 14;

// o MapLibre (depois de iniciaMapa)
export var map = null;
// Cada feira com posicao vira um objeto leve com o que o resto do site usa
// (posicao e "abrir o popup"); o desenho fica todo na camada "feiras".
export var todos = [];

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

// Se a carta nao chegar (OpenFreeMap fora do ar), os pinos aparecem mesmo
// assim, sobre um fundo liso: o site continua respondendo "onde tem feira".
var FUNDO_LISO = {
  version: 8, sources: {},
  layers: [{ id: "fundo", type: "background", paint: { "background-color": "#e8ece4" } }]
};

var limites = null;        // caixa com todas as feiras
var visiveisAtuais = [];   // marcadores que passam nos filtros
var dicaHover = null;      // nome da feira ao passar o mouse
var popupAtual = null;
var elApp = document.getElementById("app");

// ---- os pinos ----
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
  todos.forEach(function (m) {
    var f = m.feira, k = chavePin(f);
    if (!map.hasImage(k)) map.addImage(k, desenharPin(corDia(f.dia), emojiCat(f.categoria)), { pixelRatio: 2 });
  });
}

// pins menores na visao afastada (cidade toda); tamanho normal a partir deste zoom
var ZOOM_PINS_NORMAIS = 12;
var ESCALA_PIN_AFASTADO = 0.62;
function escalaPins() { return map.getZoom() < ZOOM_PINS_NORMAIS ? ESCALA_PIN_AFASTADO : 1; }

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

// os pinos no mapa passam a ser so estes (marcadores de "todos")
export function mostraPinos(lista) {
  visiveisAtuais = lista;
  var src = map.getSource("feiras");
  if (src) src.setData(colecao(visiveisAtuais));
}

// ---- a ficha (popup) de uma feira ----
// icones de traco, no mesmo desenho do de compartilhar (o emoji da bussola
// mudava de cara em cada aparelho e destoava do botao ao lado)
var ICONE_ROTA = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
  'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M3 11l18-8-8 18-2-8-8-2z"></path></svg>';
var ICONE_COMPARTILHA = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
  'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle>' +
  '<path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"></path></svg>';

function popupHTML(f) {
  var rota = "https://www.google.com/maps/dir/?api=1&destination=" + f.lat + "," + f.lng;
  return '<div class="popup-feira">' +
    '<span class="badge" style="background:' + corDia(f.dia) + '">' + esc(f.dia) + "</span> " +
    '<span class="badge badge-cat">' + emojiCat(f.categoria) + " " + esc(f.categoria) + "</span>" +
    // ficha em blocos: rotulo pequeno em cima, valor embaixo; a rua ocupa a
    // largura toda, bairro e distrito lado a lado (dl > div e HTML valido)
    '<dl class="popup-info">' +
    '<div class="pi-largo"><dt>Rua</dt><dd class="pi-rua">' + campo(nomeFeira(f)) + "</dd></div>" +
    (f.referencia ? '<div class="pi-largo"><dt>Referência</dt><dd>' + esc(maiuscula(f.referencia)) + "</dd></div>" : "") +
    "<div><dt>Horário</dt><dd>" + esc(horarioDe(f.categoria)) + "</dd></div>" +
    "<div><dt>Feirantes</dt><dd>" + (f.feirantes ? f.feirantes : "Não informado") + "</dd></div>" +
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

export function fechaPopup() {
  if (popupAtual) { var p = popupAtual; popupAtual = null; p.remove(); }
}
// a feira da ficha aberta, ou null
export function feiraDoPopup() {
  return popupAtual ? popupAtual.m.feira : null;
}
// Ancorado na ponta do pino; o deslocamento sobe ate a cabeca dele, seja
// qual for o lado em que o MapLibre o abrir (perto da borda ele inverte).
export function abrePopup(m) {
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
  if (rep) rep.onclick = function () { avisar("reportar", m.feira); };
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
export function irPara(lat, lng, zoom, comPopup) {
  var desce = comPopup && mqEstreito.matches ? Math.round(window.innerHeight * 0.14) : 0;
  map.easeTo({ center: [lng, lat], zoom: zoom, offset: [0, desce], duration: semMovimento ? 0 : 600 });
}
// bolinha sobre o mapa (voce, ponto sugerido): elemento da pagina, sempre
// acima dos pinos e sem receber toque
export function marcadorDe(classe, lat, lng) {
  var el = document.createElement("div");
  el.className = classe;
  el.innerHTML = "<span></span>";
  return new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
}
export function enquadra(pontos, folga) { // pontos: [{lat, lng}]
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

// ---- partida ----
export function iniciaMapa(feiras) {
  feiras.forEach(function (f) {
    if (f.lat == null || f.lng == null || f.lat === "" || f.lng === "") return;
    todos.push({
      feira: f, idx: todos.length, lat: +f.lat, lng: +f.lng,
      getLatLng: function () { return { lat: this.lat, lng: this.lng }; },
      openPopup: function () { abrePopup(this); }
    });
  });
  visiveisAtuais = todos;

  // o mapa ja nasce enquadrado nas feiras, sem o salto de abrir num centro
  // fixo e so depois enquadrar
  var coords = todos.map(function (m) { return [m.lng, m.lat]; });
  limites = coords.length ? limitesDe(coords, 0.03) : null;

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
  map = new maplibregl.Map(opcoesMapa);
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
  window.__mapa = map; // depuracao (e os testes de testes/celular.mjs)

  var cartaFalhou = false;
  map.on("error", function () {
    if (cartaFalhou || map.isStyleLoaded()) return;
    cartaFalhou = true;
    map.setStyle(FUNDO_LISO);
  });

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
    if (elApp.classList.contains("marcando") || !e.features.length) return;
    abrePopup(todos[e.features[0].id]);
  });

  // nome da feira ao passar o mouse
  dicaHover = new maplibregl.Popup({
    closeButton: false, closeOnClick: false, className: "dica-feira",
    anchor: "bottom", offset: [0, -PIN_H], maxWidth: "260px"
  });
  var pinoSobMouse = -1;
  map.on("mousemove", "feiras", function (e) {
    if (elApp.classList.contains("marcando") || !e.features.length) return;
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

  if (window.ResizeObserver) new ResizeObserver(ajustaTamanho).observe(document.getElementById("map"));
  window.addEventListener("resize", ajustaTamanho);
  // recolher/abrir a barra lateral anima a largura: mede de novo no fim
  document.getElementById("sidebar").addEventListener("transitionend", ajustaTamanho);
  map.once("load", function () {
    ajustaTamanho();
    // nasceu com o tamanho errado: re-enquadra a cidade, se ninguem moveu o mapa ainda
    if (limites && !estado.userPos && !estado.feiraPedida) map.fitBounds(limites, { duration: 0 });
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
}
