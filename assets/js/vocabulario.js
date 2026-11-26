/* Vocabulario y diálogos — renderizador a partir de los datos del tema (sin dependencias).
   Base: gramatica.js (opcion_multiple, completar, clasificar, relacionar, verdadero_falso, situaciones…)
   + ordenar_dialogo, escuchar_elegir, dictado, hablar, reproductor del diálogo de muestra y lectura del texto.
   Voz: es-EC (Andrea) → es-US → es-MX → es-419 → otra es-* de América; nunca es-ES. */
(function () {
  'use strict';
  var LET = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
  var ENDINGS = { ar: ['o', 'as', 'a', 'amos', 'áis', 'an', 'ar', 'ando'], er: ['o', 'es', 'e', 'emos', 'éis', 'en', 'er', 'iendo'], ir: ['o', 'es', 'e', 'imos', 'ís', 'en', 'ir', 'iendo'] };
  var TIPOS = { opcion_multiple: 'Elegir', completar: 'Completar', clasificar: 'Clasificar', relacionar: 'Emparejar', corregir: 'Corregir',
    verdadero_falso: 'Verdadero o falso', transformar: 'Transformar', ordenar: 'Ordenar', situaciones: 'Situaciones', arrastrar: 'Arrastrar a la habitación',
    ordenar_dialogo: 'Ordenar el diálogo', escuchar_elegir: 'Escuchar y elegir', dictado: 'Dictado', hablar: 'Dilo tú' };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function escH(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function anunciar(t) { var a = $('#anuncio'); if (a) { a.textContent = ''; setTimeout(function () { a.textContent = t; }, 30); } }

  /* ---------- normalización tolerante a tildes ---------- */
  function sinPunt(s) { return String(s).toLowerCase().replace(/[.,;:¡!¿?«»"()]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function sinTildes(s) { return sinPunt(s).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  // 'exacto' | 'tilde' | 'no'
  function comparar(resp, ok) {
    if (sinPunt(resp) === sinPunt(ok)) return 'exacto';
    if (sinTildes(resp) === sinTildes(ok)) return 'tilde';
    return 'no';
  }

  /* ---------- código de color (misma lógica que build.py) ---------- */
  var resaltar = function (t) { return escH(t); };
  function prepararColores(cc) {
    if (!cc || !cc.length) return;
    var alts = [], suf = [];
    cc.forEach(function (c) {
      var terms = (c.terms || []).slice();
      Object.keys(c.stems || {}).forEach(function (st) { ENDINGS[c.stems[st]].forEach(function (e) { terms.push(st + e); }); });
      terms.forEach(function (t) { alts.push([t, c]); });
      if (c.suffixes) suf.push(c);
    });
    alts.sort(function (a, b) { return b[0].length - a[0].length; });
    var reEsc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    var pt = alts.map(function (a) { return reEsc(a[0]); }).join('|');
    var src = '(?:' + pt + ')';
    if (suf.length) {
      var sa = [].concat.apply([], suf.map(function (c) { return c.suffixes; })).map(reEsc).join('|');
      src = '(?:' + pt + '|[' + LET + ']+(?:' + sa + '))';
    }
    var rx = new RegExp('(^|[^' + LET + '])(' + src + ')(?![' + LET + '])', 'gi');
    var look = {}; alts.forEach(function (a) { look[a[0].toLowerCase()] = a[1]; });
    // frases en inglés que contienen una forma española (p. ej. «comes first»): no se colorean
    var noColor = [].concat.apply([], cc.map(function (c) { return c.exclude_phrases || []; })).map(function (x) { return x.toLowerCase(); });
    function excluida(texto, ini, fin) {
      var low = texto.toLowerCase();
      return noColor.some(function (f) { var k = low.indexOf(f); while (k >= 0) { if (k <= ini && k + f.length >= fin) return true; k = low.indexOf(f, k + 1); } return false; });
    }
    resaltar = function (texto) {
      var out = '', last = 0, m;
      texto = String(texto);
      rx.lastIndex = 0;
      while ((m = rx.exec(texto))) {
        var ini = m.index + m[1].length, w = m[2], c = excluida(texto, ini, ini + w.length) ? null : look[w.toLowerCase()];
        if (!c) suf.forEach(function (s) { if (!c && (s.exclude || []).indexOf(w.toLowerCase()) < 0 && s.suffixes.some(function (x) { return w.toLowerCase().slice(-x.length) === x; })) c = s; });
        out += escH(texto.slice(last, ini));
        out += c ? '<span class="cc" style="--c:' + c.color + '" data-cc="' + escH(c.id) + '">' + escH(w) + '</span>' : escH(w);
        last = ini + w.length;
        rx.lastIndex = last;
      }
      return out + escH(texto.slice(last));
    };
  }
  function colorCategoria(cc, cat) {
    var r = null;
    (cc || []).forEach(function (c) { if ((c.categories || []).indexOf(cat) >= 0) r = c.color; });
    return r;
  }

  /* ---------- voz ---------- */
  var voz = null, voces = [];
  function normLang(v) { return (v.lang || '').toLowerCase().replace('_', '-'); }
  function rango(v) {
    var l = normLang(v), n = (v.name || '').toLowerCase();
    if (l.indexOf('es') !== 0 || l === 'es-es') return -1; // nunca es-ES
    if (l === 'es-ec') return /andrea/.test(n) ? 100 : 90;
    return { 'es-us': 80, 'es-mx': 70, 'es-419': 60 }[l] || 50;
  }
  function elegirVoz() {
    if (!('speechSynthesis' in window)) return null;
    voces = (window.speechSynthesis.getVoices() || []).filter(function (v) { return rango(v) >= 0; })
      .sort(function (a, b) { return rango(b) - rango(a); });
    return voces[0] || null;
  }
  var FEM = /andrea|paola|paulina|sabina|elena|lupe|camila|dalia|paloma|helena|laura|lucia|lucía|maria|maría|monica|mónica|penelope|penélope|mia|valentina|renata|female|mujer|femenin|google español de estados unidos/;
  var MASC = /jorge|diego|juan|carlos|alonso|enrique|pablo|miguel|andres|andrés|gonzalo|jose|josé|raul|raúl|tomas|tomás|male|hombre|masculin/;
  // voces del diálogo: una por personaje si hay; si no, la misma con otro tono
  function vocesDialogo(spk) {
    var r = {}, usadas = [];
    Object.keys(spk || {}).forEach(function (k) {
      var g = /masc/.test(spk[k].voice || '') ? MASC : /fem/.test(spk[k].voice || '') ? FEM : null;
      var v = voces.filter(function (x) { return usadas.indexOf(x) < 0 && (!g || g.test((x.name || '').toLowerCase()) && !(g === FEM ? MASC : FEM).test((x.name || '').toLowerCase())); })[0]
        || voces.filter(function (x) { return usadas.indexOf(x) < 0; })[0] || voz;
      usadas.push(v);
      var repetida = Object.keys(r).some(function (j) { return r[j].v === v; });
      r[k] = { v: v, pitch: repetida ? (/masc/.test(spk[k].voice || '') ? 0.75 : 1.25) : 1 };
    });
    return r;
  }
  function actualizarVoz() { voz = elegirVoz(); document.documentElement.classList.toggle('sin-voz', !voz); }
  function decir(t, opts) {
    if (!voz) return;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(t), v = (opts && opts.v) || voz; u.voice = v; u.lang = v.lang; u.rate = (opts && opts.rate) || 0.92;
      if (opts && opts.pitch) u.pitch = opts.pitch;
      window.speechSynthesis.speak(u);
    } catch (e) { /* sin voz */ }
  }
  // cola de frases con aviso por frase (diálogo y texto)
  var turnoCola = 0;
  function decirCola(partes, alEmpezar, alTerminar) {
    if (!voz) return;
    var mio = ++turnoCola, i = 0;
    try { window.speechSynthesis.cancel(); } catch (e) {}
    function sig() {
      if (mio !== turnoCola) return;
      if (i >= partes.length) { if (alTerminar) alTerminar(); return; }
      var p = partes[i], k = i++;
      if (alEmpezar) alEmpezar(k);
      var u = new SpeechSynthesisUtterance(p.t), v = p.v || voz; u.voice = v; u.lang = v.lang; u.rate = p.rate || 0.92; if (p.pitch) u.pitch = p.pitch;
      var hecho = false, seguir = function () { if (!hecho) { hecho = true; setTimeout(sig, p.pausa || 350); } };
      u.onend = seguir; u.onerror = seguir;
      try { window.speechSynthesis.speak(u); } catch (e) { seguir(); }
    }
    sig();
  }
  function pararCola() { turnoCola++; try { window.speechSynthesis.cancel(); } catch (e) {} }

  /* ---------- arrastrar (puntero + toque + teclado) ---------- */
  function arrastrable(pieza, opts) {
    // opts: destinos() -> [el], soltar(destino), tocar()
    var ini = null, fantasma = null, actual = null;
    pieza.addEventListener('pointerdown', function (ev) {
      if (pieza.disabled) return;
      ini = { x: ev.clientX, y: ev.clientY, id: ev.pointerId };
      try { pieza.setPointerCapture(ev.pointerId); } catch (e) {}
    });
    pieza.addEventListener('pointermove', function (ev) {
      if (!ini) return;
      if (!fantasma && Math.hypot(ev.clientX - ini.x, ev.clientY - ini.y) > 8) {
        fantasma = pieza.cloneNode(true); fantasma.classList.add('fantasma'); fantasma.removeAttribute('id');
        document.body.appendChild(fantasma);
      }
      if (fantasma) {
        ev.preventDefault();
        fantasma.style.left = ev.clientX + 'px'; fantasma.style.top = ev.clientY + 'px';
        // listas largas en el móvil: desplazar la página al acercarse al borde
        if (ev.pointerType !== 'mouse' && ev.clientY > window.innerHeight - 50) window.scrollBy(0, 18); else if (ev.pointerType !== 'mouse' && ev.clientY < 50) window.scrollBy(0, -18);
        var d = destinoEn(ev.clientX, ev.clientY);
        if (d !== actual) { if (actual) actual.classList.remove('encima'); actual = d; if (d) d.classList.add('encima'); }
      }
    });
    function destinoEn(x, y) {
      var ds = opts.destinos();
      for (var i = 0; i < ds.length; i++) {
        var r = ds[i].getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return ds[i];
      }
      return null;
    }
    function fin(ev, cancel) {
      if (!ini) return;
      var arrastrando = !!fantasma;
      if (fantasma) { fantasma.remove(); fantasma = null; }
      if (actual) actual.classList.remove('encima');
      var d = actual; actual = null; ini = null;
      if (cancel) return;
      if (arrastrando) { if (d) opts.soltar(d); }
      else if (opts.tocar) opts.tocar();
    }
    pieza.addEventListener('pointerup', function (ev) { fin(ev, false); });
    pieza.addEventListener('pointercancel', function (ev) { fin(ev, true); });
    pieza.addEventListener('keydown', function (ev) { if ((ev.key === 'Enter' || ev.key === ' ') && opts.tocar) { ev.preventDefault(); opts.tocar(); } });
  }

  /* ---------- escena: cocina ---------- */
  var COCINA = '<svg viewBox="0 0 600 360" role="img" aria-label="Una cocina: una ventana a la izquierda, una mesa en el centro con una canasta y una nevera a la derecha." xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="600" height="300" fill="#F6EBD9"/><rect y="300" width="600" height="60" fill="#D9C3A0"/>' +
    '<path d="M0 300H600M100 300L60 360M220 300L200 360M340 300L340 360M460 300L480 360" stroke="#C2A982" stroke-width="2"/>' +
    '<g id="sc-ventana"><rect x="50" y="68" width="120" height="112" rx="4" fill="#CFE6F2" stroke="#8B6B4A" stroke-width="8"/>' +
    '<path d="M110 68V180M50 124H170" stroke="#8B6B4A" stroke-width="6"/><rect x="42" y="180" width="136" height="10" fill="#8B6B4A"/></g>' +
    '<text x="110" y="210" font-size="15" text-anchor="middle" fill="#4c5d6b" font-family="Georgia,serif">la ventana</text>' +
    '<g id="sc-mesa"><rect x="200" y="198" width="210" height="14" rx="3" fill="#A0703F"/><rect x="214" y="212" width="10" height="88" fill="#8A5E33"/>' +
    '<rect x="386" y="212" width="10" height="88" fill="#8A5E33"/></g>' +
    '<text x="305" y="236" font-size="15" text-anchor="middle" fill="#4c5d6b" font-family="Georgia,serif">la mesa</text>' +
    '<g id="sc-cesta"><path d="M318 176H362L355 198H325Z" fill="#C9964F" stroke="#8A5E33" stroke-width="2"/><path d="M324 177Q340 150 356 177" fill="none" stroke="#8A5E33" stroke-width="3"/></g>' +
    '<text x="340" y="146" font-size="14" text-anchor="middle" fill="#4c5d6b" font-family="Georgia,serif">la canasta</text>' +
    '<g id="sc-nevera"><rect x="470" y="88" width="98" height="212" rx="9" fill="#E8EEF1" stroke="#9AA7B0" stroke-width="4"/>' +
    '<path d="M470 160H568" stroke="#9AA7B0" stroke-width="3"/><rect x="552" y="110" width="6" height="34" rx="3" fill="#7E8C96"/><rect x="552" y="176" width="6" height="50" rx="3" fill="#7E8C96"/></g>' +
    '<text x="519" y="80" font-size="15" text-anchor="middle" fill="#4c5d6b" font-family="Georgia,serif">la nevera</text></svg>';
  var T = function (x, y, t, sz) { return '<text x="' + x + '" y="' + y + '" font-size="' + (sz || 15) + '" text-anchor="middle" fill="#4c5d6b" font-family="Georgia,serif">' + t + '</text>'; };
  var REUNION = '<svg viewBox="0 0 600 360" role="img" aria-label="Una sala de reunión." xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="600" height="210" fill="#EEF1F4"/><rect y="210" width="600" height="150" fill="#CDBBA0"/>' +
    '<g id="sc-ventanas"><rect x="40" y="40" width="90" height="100" rx="3" fill="#CFE6F2" stroke="#7C8A96" stroke-width="6"/><path d="M85 40V140" stroke="#7C8A96" stroke-width="4"/>' +
    '<rect x="470" y="40" width="90" height="100" rx="3" fill="#CFE6F2" stroke="#7C8A96" stroke-width="6"/><path d="M515 40V140" stroke="#7C8A96" stroke-width="4"/></g>' + T(300, 30, 'al fondo', 13) +
    '<g id="sc-reloj"><circle cx="300" cy="78" r="30" fill="#fff" stroke="#5B6770" stroke-width="5"/><path d="M300 78V58M300 78L314 86" stroke="#2F4254" stroke-width="4" stroke-linecap="round"/></g>' +
    T(300, 128, 'el reloj', 14) + T(85, 160, 'las ventanas', 13) + T(515, 160, 'las ventanas', 13) +
    '<g id="sc-oyente"><circle cx="300" cy="170" r="22" fill="#B98B6A"/><path d="M262 232Q300 192 338 232Z" fill="#5E7F9A"/></g>' + T(380, 196, 'la otra persona', 13) +
    '<g id="sc-mesa"><path d="M150 232H450L520 300H80Z" fill="#A0703F"/></g>' +
    '<g id="sc-hablante"><path d="M200 360Q205 318 240 312L270 318L262 360Z" fill="#B98B6A"/><path d="M400 360Q395 318 360 312L330 318L338 360Z" fill="#B98B6A"/></g>' +
    T(300, 352, 'tú (aquí)', 14) + '</svg>';
  var SALON = '<svg viewBox="0 0 600 360" role="img" aria-label="Una sala de estar." xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="600" height="290" fill="#F3EBDD"/><rect y="290" width="600" height="70" fill="#C9A97F"/>' +
    '<g id="sc-ventana"><rect x="250" y="40" width="110" height="90" rx="3" fill="#CFE6F2" stroke="#8B6B4A" stroke-width="7"/><path d="M305 40V130" stroke="#8B6B4A" stroke-width="5"/></g>' + T(305, 30, 'la ventana', 14) +
    '<g id="sc-puerta"><rect x="500" y="110" width="80" height="180" rx="4" fill="#9C6B43" stroke="#7A512F" stroke-width="4"/><circle cx="512" cy="205" r="5" fill="#E2C27A"/></g>' + T(540, 100, 'la puerta', 14) +
    '<g id="sc-sofa"><rect x="120" y="200" width="200" height="60" rx="14" fill="#6E8B74"/><rect x="110" y="180" width="30" height="80" rx="10" fill="#5E7A64"/><rect x="300" y="180" width="30" height="80" rx="10" fill="#5E7A64"/>' +
    '<rect x="135" y="170" width="180" height="40" rx="12" fill="#7E9B84"/><rect x="128" y="260" width="10" height="22" fill="#4A3526"/><rect x="312" y="260" width="10" height="22" fill="#4A3526"/></g>' + T(220, 194, 'el sofá', 14) +
    '<g id="sc-mesa"><rect x="20" y="200" width="70" height="10" fill="#A0703F"/><rect x="50" y="210" width="10" height="78" fill="#8A5E33"/></g>' + T(55, 306, 'la mesa', 14) +
    '<g id="sc-tele"><rect x="380" y="160" width="100" height="62" rx="5" fill="#2F3A44"/><rect x="420" y="222" width="20" height="10" fill="#2F3A44"/><rect x="370" y="232" width="120" height="56" fill="#8A6A4E"/></g>' + T(430, 252, 'el televisor', 13) +
    '</svg>';
  var ESCENAS = { cocina: COCINA, reunion: REUNION, salon: SALON };
  var OBJETOS = { lampara: '💡', gato: '🐈', tazas: '☕☕', planta: '🪴', pan: '🍞', taza: '☕', cuaderno: '📓', boligrafos: '🖊️🖊️', vasos: '🥛🥛',
    silla: '🪑', objeto: '❓', mochila: '🎒', control: '🎛️', yo: '🙋' };
  function escena(id) {
    var d = el('div', { class: 'escena', 'data-escena': id || 'cocina' });
    d.innerHTML = ESCENAS[id] || COCINA;
    return d;
  }
  function ponerObjeto(esc, id, x, y) {
    var o = esc.querySelector('.obj[data-obj="' + id + '"]');
    if (!o) { o = el('span', { class: 'obj', 'data-obj': id, 'aria-hidden': 'true', text: OBJETOS[id] || '•' }); esc.appendChild(o); }
    o.style.left = x + '%'; o.style.top = y + '%';
    o.classList.remove('pop'); void o.offsetWidth; o.classList.add('pop');
  }
  function resaltarParte(esc, id) {
    $$('.resaltado', esc).forEach(function (g) { g.classList.remove('resaltado'); });
    var g = esc.querySelector('#sc-' + id);
    if (g) $$('rect,path', g).forEach(function (p) { p.classList.add('resaltado'); });
  }

  /* ---------- progreso ---------- */
  var total = 0, hechos = 0;
  function progreso() {
    var b = $('.barra-prog i'), t = $('.prog-txt');
    if (b) b.style.width = (total ? (100 * hechos / total) : 0) + '%';
    if (t) t.textContent = hechos + ' de ' + total + ' · completado';
  }

  /* ---------- feedback ---------- */
  function fb(tipo, titulo, texto) {
    var p = el('p', { class: 'fb ' + tipo, role: 'status' });
    p.innerHTML = '<b>' + escH(titulo) + '</b> ' + (texto ? '<span lang="en">' + resaltar(texto) + '</span>' : '');
    return p;
  }
  function conHueco(prompt, rellenar) {
    var h = resaltar(prompt);
    var nH = (prompt.match(/_{3,}/g) || []).length;
    var r = String(rellenar || ''), partes = null;
    if (rellenar && nH > 1) partes = r.split(' / ').length === nH ? r.split(' / ') : (r.split(/\s+/).length === nH ? r.split(/\s+/) : null);
    if (partes) { var k = 0; return h.replace(/_{3,}/g, function () { return '<span class="hueco-txt">' + resaltar(partes[k++]) + '</span>'; }); }
    return h.replace(/_{3,}/, '<span class="hueco-txt">' + (rellenar ? resaltar(rellenar) : '&nbsp;') + '</span>');
  }

  /* ---------- un ejercicio ---------- */
  function Ejercicio(e, k, cc, cont) {
    var art = el('article', { class: 'ejercicio' + (e.extra && e.extra.no_color ? ' sin-cc' : ''), id: e.id, 'data-tipo': e.type });
    art.appendChild(el('span', { class: 'tipo', text: TIPOS[e.type] || e.type }));
    art.appendChild(el('h3', { html: '<span class="num">' + k + '.</span><span lang="en">' + escH(e.title_en) + '</span>' }));
    art.appendChild(el('p', { class: 'consigna', lang: 'en', text: e.instructions_en }));
    var cuerpo = el('div', { class: 'cuerpo' });
    art.appendChild(cuerpo);
    var resumen = el('p', { class: 'resumen', hidden: '' });
    art.appendChild(resumen);
    cont.appendChild(art);
    var n = e.type === 'ordenar_dialogo' ? 1 : e.items.length, resueltos = 0, aciertos = 0, terminado = false;
    function item(ok) {
      resueltos++; if (ok) aciertos++;
      if (resueltos >= n && !terminado) {
        terminado = true; hechos++; progreso();
        resumen.hidden = false;
        resumen.textContent = '✓ ' + aciertos + ' de ' + n + ' a la primera';
        art.setAttribute('data-hecho', '1');
        anunciar('Ejercicio ' + k + ' completado: ' + aciertos + ' de ' + n);
      }
    }
    var api = { e: e, cc: cc, cuerpo: cuerpo, item: item };
    var t = e.type;
    if (t === 'clasificar') rClasificar(api);
    else if (t === 'relacionar') rRelacionar(api);
    else if (t === 'ordenar' && e.items.every(ordenable)) rOrdenar(api);
    else if (t === 'arrastrar') rArrastrar(api);
    else if (t === 'ordenar_dialogo') rOrdenarDialogo(api);
    else if (t === 'dictado') e.items.forEach(function (it, i) { rDictado(api, it, i); });
    else if (t === 'hablar') e.items.forEach(function (it, i) { rHablar(api, it, i); });
    else if (t === 'escuchar_elegir') e.items.forEach(function (it, i) {
      rElegir(api, Object.assign({}, it, { prompt: String(it.prompt).replace(/^🔊\s*/, '') }), i);
      var lg = api.cuerpo.lastChild.querySelector('legend');
      lg.insertBefore(el('button', { type: 'button', class: 'son escuchar', 'data-decir': it.say, 'aria-label': 'Escuchar la frase ' + (i + 1), text: '🔊 Escuchar' }), lg.childNodes[1] || null);
    });
    else if (t === 'verdadero_falso') e.items.forEach(function (it, i) { rElegir(api, it, i, true); });
    else if (t === 'completar') e.items.forEach(function (it, i) { escribible(it) ? rEscribir(api, it, i) : rElegir(api, it, i); });
    else e.items.forEach(function (it, i) { rElegir(api, it, i); });
  }

  function idioma(t) {
    if (/_{3,}/.test(t)) return 'es';
    return /\b(the|you|your|yours|is|are|an|of|to|and|with|I|she|he|they|we|someone|what|say|first|same|now|has|asks|for|in|it|tell|state|okay)\b/.test(t) ? 'en' : 'es';
  }
  function escribible(it) {
    return /_{3,}/.test(it.prompt) && it.answer.split(' ').length <= 2 && it.options.every(function (o) { return o.split(' ').length <= 2; });
  }
  function palabras(s) { return sinPunt(s).split(' ').filter(Boolean); }
  function ordenable(it) {
    var a = palabras(it.answer).sort().join(' '), b = palabras(it.prompt.split('/').join(' ')).sort().join(' ');
    return a === b;
  }

  // elegir: opcion_multiple, corregir, situaciones, transformar, completar (frases), verdadero_falso
  function rElegir(api, it, i, vf) {
    var e = api.e;
    var nH = (it.prompt.match(/_{3,}/g) || []).length, partes = String(it.answer).split(' / ');
    if (!vf && nH >= 2 && partes.length === nH && it.options.indexOf(it.answer) < 0) return rVariosHuecos(api, it, i, partes);
    var f = el('fieldset', { class: 'item', 'data-i': i });
    var pre = el('legend', { class: 'preg' });
    var icono = e.type === 'situaciones' ? '💬 ' : '';
    if (e.type === 'corregir') { pre.className = 'preg mal-orig'; pre.innerHTML = '<span class="n">' + (i + 1) + '.</span>❌ <s>' + resaltar(it.prompt) + '</s>'; }
    else pre.innerHTML = '<span class="n">' + (i + 1) + '.</span>' + icono + '<span lang="' + idioma(it.prompt) + '">' + conHueco(it.prompt) + '</span>';
    f.appendChild(pre);
    var largo = it.options.some(function (o) { return o.length > 22; });
    var ops = el('div', { class: 'opciones' + (vf ? ' vf' : '') + (largo ? ' col' : '') });
    it.options.forEach(function (o) {
      var txt = vf ? (o === 'verdadero' ? 'Verdadero' : o === 'falso' ? 'Falso' : o) : o;
      var b = el('button', { type: 'button', class: 'op', 'data-op': o, html: resaltar(txt) });
      b.addEventListener('click', function () {
        var ok = o === it.answer;
        $$('button', ops).forEach(function (x) { x.disabled = true; if (x.getAttribute('data-op') === it.answer) x.classList.add('correcta'); });
        if (!ok) { b.classList.add('incorrecta'); f.classList.add('shake'); }
        f.classList.add(ok ? 'ok' : 'mal');
        if (/_{3,}/.test(it.prompt) && !vf && e.type !== 'corregir') pre.innerHTML = '<span class="n">' + (i + 1) + '.</span>' + conHueco(it.prompt, it.answer);
        f.appendChild(fb(ok ? 'ok' : 'mal', ok ? '¡Correcto!' : 'No es correcto.', (ok ? '' : 'Answer: ' + (vf ? it.answer : it.answer) + '. ') + it.feedback_en));
        api.item(ok);
      });
      ops.appendChild(b);
    });
    f.appendChild(ops);
    api.cuerpo.appendChild(f);
  }

  // varios huecos en una frase (ni … ni): un grupo de opciones por hueco
  function rVariosHuecos(api, it, i, partes) {
    var f = el('fieldset', { class: 'item', 'data-i': i });
    var pre = el('legend', { class: 'preg' });
    function pintar(vals) {
      var k = 0;
      pre.innerHTML = '<span class="n">' + (i + 1) + '.</span><span lang="es">' + resaltar(it.prompt).replace(/_{3,}/g, function () {
        var v = vals[k++]; return '<span class="hueco-txt">' + (v ? resaltar(v) : '&nbsp;' + k + '&nbsp;') + '</span>';
      }) + '</span>';
    }
    var elegidos = partes.map(function () { return null; });
    pintar(elegidos);
    f.appendChild(pre);
    var unicas = it.options.filter(function (o, k) { return it.options.indexOf(o) === k; });
    var grupos = partes.map(function (p, h) {
      var g = el('div', { class: 'opciones', 'data-hueco': h, 'aria-label': 'Hueco ' + (h + 1) });
      g.appendChild(el('span', { class: 'banco lbl', text: (h + 1) + ':' }));
      unicas.forEach(function (o) {
        var b = el('button', { type: 'button', class: 'op', 'data-op': o, 'aria-pressed': 'false', html: resaltar(o) });
        b.addEventListener('click', function () {
          if (b.disabled) return;
          $$('button', g).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); x.classList.remove('elegida'); });
          b.setAttribute('aria-pressed', 'true'); elegidos[h] = o; pintar(elegidos);
          if (elegidos.every(Boolean)) evaluar();
        });
        g.appendChild(b);
      });
      f.appendChild(g); return g;
    });
    function evaluar() {
      var ok = elegidos.every(function (v, h) { return v === partes[h]; });
      grupos.forEach(function (g, h) { $$('button', g).forEach(function (x) {
        x.disabled = true;
        if (x.getAttribute('data-op') === partes[h]) x.classList.add('correcta');
        else if (x.getAttribute('aria-pressed') === 'true') x.classList.add('incorrecta');
      }); });
      pintar(partes);
      f.classList.add(ok ? 'ok' : 'mal');
      f.appendChild(fb(ok ? 'ok' : 'mal', ok ? '¡Correcto!' : 'No es correcto.', (ok ? '' : 'Answer: ' + partes.join(' … ') + '. ') + it.feedback_en));
      api.item(ok);
    }
    api.cuerpo.appendChild(f);
  }

  // completar escribiendo (tolerante a tildes, avisa de la tilde)
  function rEscribir(api, it, i) {
    var f = el('fieldset', { class: 'item', 'data-i': i });
    var pre = el('legend', { class: 'preg', html: '<span class="n">' + (i + 1) + '.</span>' + conHueco(it.prompt) });
    f.appendChild(pre);
    var caja = el('div', { class: 'escribir' });
    var inp = el('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Respuesta ' + (i + 1), lang: 'es' });
    var btn = el('button', { type: 'button', class: 'btn', text: 'Comprobar' });
    caja.appendChild(inp); caja.appendChild(btn); f.appendChild(caja);
    var banco = el('ul', { class: 'banco', 'aria-label': 'Opciones' });
    banco.appendChild(el('li', { class: 'lbl', lang: 'en', text: 'Tap or type:' }));
    it.options.forEach(function (o) {
      var b = el('button', { type: 'button', html: resaltar(o), 'data-op': o });
      b.addEventListener('click', function () { if (!inp.disabled) { inp.value = o === 'sin artículo' ? 'sin artículo' : o; inp.focus(); } });
      banco.appendChild(el('li', null, [b]));
    });
    f.appendChild(banco);
    var intentos = 0, msg = null;
    function comprobar() {
      if (inp.disabled) return;
      var v = inp.value.trim();
      if (!v) { inp.focus(); return; }
      intentos++;
      var r = comparar(v, it.answer);
      // si otra opción solo se distingue por la tilde (tu / tú), la tilde cuenta
      var gemela = it.options.some(function (o) { return o !== it.answer && sinTildes(o) === sinTildes(it.answer); });
      if (r === 'tilde' && gemela) r = 'no';
      if (msg) msg.remove();
      if (r === 'exacto' || r === 'tilde') {
        fin(true);
        msg = r === 'exacto' ? fb('ok', '¡Correcto!', it.feedback_en)
          : fb('casi', '¡Correcto! Ojo con la tilde:', '');
        if (r === 'tilde') msg.innerHTML += ' <span lang="es"><b>' + resaltar(it.answer) + '</b></span>. <span lang="en">' + resaltar(it.feedback_en) + '</span>';
        f.appendChild(msg);
        api.item(intentos === 1);
      } else if (intentos < 2) {
        caja.classList.add('mal'); f.classList.add('shake');
        setTimeout(function () { f.classList.remove('shake'); }, 450);
        msg = fb('mal', 'Todavía no.', 'Try again — look at the options.');
        f.appendChild(msg); inp.select();
      } else {
        fin(false);
        msg = fb('mal', 'La respuesta es:', '');
        msg.innerHTML += ' <b lang="es">' + resaltar(it.answer) + '</b>. <span lang="en">' + resaltar(it.feedback_en) + '</span>';
        f.appendChild(msg);
        api.item(false);
      }
    }
    function fin(ok) {
      inp.disabled = true; btn.disabled = true; $$('button', banco).forEach(function (b) { b.disabled = true; });
      caja.classList.remove('mal'); caja.classList.add(ok ? 'ok' : 'mal'); f.classList.add(ok ? 'ok' : 'mal');
      pre.innerHTML = '<span class="n">' + (i + 1) + '.</span>' + conHueco(it.prompt, it.answer);
    }
    btn.addEventListener('click', comprobar);
    inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); comprobar(); } });
    api.cuerpo.appendChild(f);
  }

  // clasificar: tarjetas → cajas (arrastrar o tocar tarjeta + caja)
  function rClasificar(api) {
    var e = api.e, cats = e.items[0].options;
    var bandeja = el('div', { class: 'bandeja', 'aria-label': 'Tarjetas' });
    var cajas = el('div', { class: 'cajas' });
    var sel = null, info = el('div', { class: 'info-cl', 'aria-live': 'polite' });
    var fallos = {};
    var cajaEls = cats.map(function (c) {
      var col = colorCategoria(api.cc, c);
      var b = el('button', { type: 'button', class: 'caja', 'data-cat': c, style: col ? '--c:' + col : '' });
      b.appendChild(el('span', { class: 'tit', html: resaltar(c) }));
      b.addEventListener('click', function () { if (sel) colocar(sel, b); });
      cajas.appendChild(b);
      return b;
    });
    function colocar(t, caja) {
      var it = e.items[+t.getAttribute('data-i')], cat = caja.getAttribute('data-cat');
      info.innerHTML = '';
      if (cat === it.answer) {
        var prim = !fallos[t.getAttribute('data-i')];
        var d = el('span', { class: 'dentro' + (prim ? '' : ' fallo'), html: resaltar(it.prompt) + ' ✓' });
        caja.appendChild(d); t.remove(); sel = null; caja.classList.add('pop');
        setTimeout(function () { caja.classList.remove('pop'); }, 400);
        info.appendChild(fb('ok', '¡Correcto!', it.prompt + ' → ' + cat + '. ' + it.feedback_en));
        api.item(prim);
      } else {
        var idx = t.getAttribute('data-i');
        fallos[idx] = (fallos[idx] || 0) + 1;
        t.classList.add('shake'); setTimeout(function () { t.classList.remove('shake'); }, 450);
        if (fallos[idx] >= 2) {
          var ok = cajaEls.filter(function (c) { return c.getAttribute('data-cat') === it.answer; })[0];
          ok.appendChild(el('span', { class: 'dentro fallo', html: resaltar(it.prompt) }));
          t.remove(); sel = null;
          info.appendChild(fb('mal', 'Va en «' + it.answer + '».', it.feedback_en));
          api.item(false);
        } else {
          info.appendChild(fb('mal', 'No va en «' + cat + '».', 'Try the other group.'));
        }
      }
      cajaEls.forEach(function (c) { c.classList.remove('elegible'); });
    }
    e.items.forEach(function (it, i) {
      var t = el('button', { type: 'button', class: 'tarjeta', 'data-i': i, 'aria-pressed': 'false', html: resaltar(it.prompt) });
      arrastrable(t, {
        destinos: function () { return cajaEls; },
        soltar: function (d) { colocar(t, d); },
        tocar: function () {
          $$('.tarjeta', bandeja).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
          sel = t; t.setAttribute('aria-pressed', 'true');
          cajaEls.forEach(function (c) { c.classList.add('elegible'); });
        }
      });
      bandeja.appendChild(t);
    });
    api.cuerpo.appendChild(el('p', { class: 'consigna', lang: 'en', text: 'Drag a card into a box, or tap a card and then a box.' }));
    api.cuerpo.appendChild(bandeja); api.cuerpo.appendChild(cajas); api.cuerpo.appendChild(info);
  }

  // relacionar (emparejar): tocar izquierda + derecha, o arrastrar izquierda → derecha
  function rRelacionar(api) {
    var e = api.e;
    var der = [];
    e.items.forEach(function (it) { it.options.forEach(function (o) { if (der.indexOf(o) < 0) der.push(o); }); });
    der = mezclar(der, e.id);
    // una opción de la derecha puede servir para varios ítems (p. ej. «igualdad»): solo se cierra al usarla todas las veces
    var quedan = {}; e.items.forEach(function (it) { quedan[it.answer] = (quedan[it.answer] || 0) + 1; });
    function usar(d) { var o = d.getAttribute('data-der'); quedan[o]--; if (quedan[o] <= 0) { d.classList.add('hecha'); d.disabled = true; } }
    var caja = el('div', { class: 'parejas' });
    var cI = el('div', { class: 'colu', 'aria-label': 'Columna A' }), cD = el('div', { class: 'colu', 'aria-label': 'Columna B' });
    var info = el('div', { 'aria-live': 'polite' }), sel = null, fallos = {};
    var dEls = der.map(function (o) {
      var b = el('button', { type: 'button', class: 'op', 'data-der': o, html: resaltar(o) });
      b.addEventListener('click', function () { if (sel && !b.classList.contains('hecha')) unir(sel, b); });
      cD.appendChild(b); return b;
    });
    function unir(izq, d) {
      var i = +izq.getAttribute('data-i'), it = e.items[i], o = d.getAttribute('data-der');
      info.innerHTML = '';
      if (o === it.answer) {
        var prim = !fallos[i];
        izq.classList.add('hecha'); izq.disabled = true; izq.setAttribute('aria-pressed', 'false');
        izq.innerHTML = resaltar(it.prompt) + '<span class="par">→ ' + resaltar(o) + ' ✓</span>';
        usar(d); sel = null;
        info.appendChild(fb('ok', '¡Correcto!', it.feedback_en));
        api.item(prim);
      } else {
        fallos[i] = (fallos[i] || 0) + 1;
        d.classList.add('shake'); setTimeout(function () { d.classList.remove('shake'); }, 450);
        if (fallos[i] >= 2) {
          var ok = dEls.filter(function (x) { return x.getAttribute('data-der') === it.answer; })[0];
          izq.classList.add('hecha'); izq.disabled = true;
          izq.innerHTML = resaltar(it.prompt) + '<span class="par" style="color:var(--mal)">→ ' + resaltar(it.answer) + '</span>';
          usar(ok); sel = null;
          info.appendChild(fb('mal', 'La pareja es: ' + it.prompt + ' → ' + it.answer + '.', it.feedback_en));
          api.item(false);
        } else info.appendChild(fb('mal', 'No es su pareja.', 'Try again.'));
      }
    }
    e.items.forEach(function (it, i) {
      var b = el('button', { type: 'button', class: 'op', 'data-i': i, 'aria-pressed': 'false', html: resaltar(it.prompt) });
      arrastrable(b, {
        destinos: function () { return dEls.filter(function (x) { return !x.classList.contains('hecha'); }); },
        soltar: function (d) { unir(b, d); },
        tocar: function () { $$('[data-i]', cI).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); sel = b; b.setAttribute('aria-pressed', 'true'); }
      });
      cI.appendChild(b);
    });
    caja.appendChild(cI); caja.appendChild(cD);
    api.cuerpo.appendChild(el('p', { class: 'consigna', lang: 'en', text: 'Tap an item on the left, then its match on the right (or drag it).' }));
    api.cuerpo.appendChild(caja); api.cuerpo.appendChild(info);
  }

  // ordenar: fichas de palabras → frase
  function rOrdenar(api) {
    api.e.items.forEach(function (it, i) {
      var f = el('fieldset', { class: 'item', 'data-i': i });
      f.appendChild(el('legend', { class: 'preg', html: '<span class="n">' + (i + 1) + '.</span>' + resaltar(it.prompt) }));
      var linea = el('div', { class: 'linea-orden', 'data-vacio': 'Tap the words in order', 'aria-label': 'Tu frase' });
      var fichas = el('div', { class: 'fichas-p' });
      var botones = el('div', { class: 'opciones' });
      var btn = el('button', { type: 'button', class: 'btn', text: 'Comprobar' });
      var borrar = el('button', { type: 'button', class: 'btn sec', text: 'Borrar' });
      botones.appendChild(btn); botones.appendChild(borrar);
      it.prompt.split('/').map(function (w) { return w.trim(); }).filter(function (w) { return new RegExp('[' + LET + ']').test(w); }).forEach(function (w) {
        var b = el('button', { type: 'button', class: 'ficha-p', 'data-w': w, html: resaltar(w) });
        b.addEventListener('click', function () { if (btn.disabled) return; (b.parentNode === fichas ? linea : fichas).appendChild(b); });
        fichas.appendChild(b);
      });
      var intentos = 0, msg = null;
      borrar.addEventListener('click', function () { $$('.ficha-p', linea).forEach(function (b) { fichas.appendChild(b); }); });
      btn.addEventListener('click', function () {
        var frase = $$('.ficha-p', linea).map(function (b) { return b.getAttribute('data-w'); }).join(' ');
        if (fichas.children.length) { if (msg) msg.remove(); msg = fb('mal', 'Usa todas las palabras.', 'Use all the words.'); f.appendChild(msg); return; }
        intentos++;
        var ok = sinTildes(frase) === sinTildes(it.answer);
        if (msg) msg.remove();
        if (ok || intentos >= 2) {
          btn.disabled = true; borrar.disabled = true;
          linea.className = 'linea-orden ' + (ok ? 'ok' : 'mal');
          linea.innerHTML = '<span>' + resaltar(it.answer) + '</span>';
          msg = fb(ok ? 'ok' : 'mal', ok ? '¡Correcto!' : 'La frase es: ' + it.answer, it.feedback_en);
          f.appendChild(msg); f.classList.add(ok ? 'ok' : 'mal');
          api.item(ok && intentos === 1);
        } else {
          linea.classList.add('mal'); f.classList.add('shake'); setTimeout(function () { f.classList.remove('shake'); linea.classList.remove('mal'); }, 450);
          var otra = it.options.filter(function (o) { return o !== it.answer && sinTildes(o) === sinTildes(frase); })[0];
          msg = fb('mal', 'Todavía no.', otra ? 'That order is not the one we want here. Try again.' : 'Try another order.');
          f.appendChild(msg);
        }
      });
      f.appendChild(linea); f.appendChild(fichas); f.appendChild(botones);
      api.cuerpo.appendChild(f);
    });
  }

  // arrastrar a la habitación
  function rArrastrar(api) {
    var e = api.e, ex = e.extra || {}, sc = e.scene || {};
    var esc = escena(ex.scene_id || sc.id || 'cocina');
    if (sc.description_es) esc.querySelector('svg').setAttribute('aria-label', sc.description_es);
    var modoZonas = sc.zones && e.items.every(function (it) { return it.zone; });
    if (modoZonas) esc.classList.add('con-zonas');
    var paso = el('p', { class: 'preg', 'aria-live': 'polite' });
    var bandeja = el('div', { class: 'bandeja' });
    var info = el('div', { 'aria-live': 'polite' });
    var lista = el('ul', { class: 'frases-plano', 'aria-label': 'Frases' });
    var i = 0, fallos = 0, zonasEls = [];
    if (modoZonas) {
      sc.zones.forEach(function (z) {
        var b = el('button', { type: 'button', class: 'zona' + (z.label_pos === 'above' ? ' arriba' : ''), 'data-zona': z.id, style: 'left:' + z.x + '%;top:' + z.y + '%', 'aria-label': z.label, html: '<span class="zl">' + escH(z.label) + '</span>' });
        b.addEventListener('click', function () { var s = $('.pieza[aria-pressed="true"]', bandeja); if (s) evaluar(z.id, s); });
        esc.appendChild(b); zonasEls.push(b);
      });
    }
    api.cuerpo.appendChild(el('p', { class: 'consigna', lang: 'en', text: modoZonas ? 'Drag the object to the right place in the room (or tap the object, then the place).' : 'Drag the right sentence into the ' + (ex.place_en || 'kitchen') + ' (or tap it).' }));
    api.cuerpo.appendChild(esc); api.cuerpo.appendChild(paso); api.cuerpo.appendChild(bandeja); api.cuerpo.appendChild(info); api.cuerpo.appendChild(lista);
    function evaluar(valor, pieza) {
      var it = e.items[i], x = (ex.items || [])[i] || {};
      var ok = modoZonas ? valor === it.zone : valor === it.answer;
      info.innerHTML = '';
      zonasEls.forEach(function (z) { z.classList.remove('elegible'); });
      if (ok) {
        if (modoZonas) { var z = sc.zones.filter(function (q) { return q.id === it.zone; })[0]; ponerObjeto(esc, it.object, z.x, z.y); }
        else if (x.show) { if (OBJETOS[x.show] && x.at) ponerObjeto(esc, x.show, x.at[0], x.at[1]); else resaltarParte(esc, x.show); }
        var frase = it.answer_text || it.answer;
        lista.appendChild(el('li', { html: '<span>✓</span><span lang="es">' + resaltar(modoZonas ? (it.sentence || frase) : frase) + '</span>' }));
        decir(modoZonas ? (it.sentence || '') : frase);
        info.appendChild(fb('ok', '¡Correcto!', it.feedback_en));
        api.item(fallos === 0);
        i++; fallos = 0;
        setTimeout(mostrar, 250);
      } else {
        fallos++;
        pieza.classList.add('shake'); setTimeout(function () { pieza.classList.remove('shake'); }, 450);
        if (!modoZonas) { pieza.disabled = true; pieza.classList.add('puesta'); }
        info.appendChild(fb('mal', 'No es correcto.', fallos >= 2 && !modoZonas ? it.feedback_en : 'Try again.'));
      }
    }
    function mostrar() {
      bandeja.innerHTML = '';
      if (i >= e.items.length) { paso.innerHTML = '🏁 <span lang="en">All done.</span>'; return; }
      var it = e.items[i];
      paso.innerHTML = '<span class="n">' + (i + 1) + '/' + e.items.length + '</span> ' + '<span lang="' + idioma(it.prompt) + '">' + resaltar(it.prompt) + '</span>';
      if (modoZonas) {
        var p = el('button', { type: 'button', class: 'pieza', 'aria-pressed': 'false', 'data-obj': it.object, html: '<span class="i">' + (OBJETOS[it.object] || '•') + '</span>' + escH(it.object_label || it.object) });
        arrastrable(p, { destinos: function () { return zonasEls; }, soltar: function (d) { evaluar(d.getAttribute('data-zona'), p); },
          tocar: function () { p.setAttribute('aria-pressed', 'true'); zonasEls.forEach(function (z) { z.classList.add('elegible'); }); } });
        bandeja.appendChild(p);
      } else {
        it.options.forEach(function (o) {
          var p = el('button', { type: 'button', class: 'pieza', 'data-op': o, html: resaltar(o) });
          arrastrable(p, { destinos: function () { return [esc]; }, soltar: function () { evaluar(o, p); }, tocar: function () { evaluar(o, p); } });
          bandeja.appendChild(p);
        });
      }
    }
    mostrar();
  }

  function mezclar(arr, semilla) {
    var a = arr.slice(), s = 0;
    for (var k = 0; k < semilla.length; k++) s = (s * 31 + semilla.charCodeAt(k)) >>> 0;
    for (var j = a.length - 1; j > 0; j--) { s = (s * 1103515245 + 12345) >>> 0; var r = s % (j + 1); var t = a[j]; a[j] = a[r]; a[r] = t; }
    return a;
  }

  /* ---------- plano interactivo (visual de hay / estar) ---------- */
  function plano(cont, v) {
    var esc = escena(v.scene);
    esc.classList.add('con-zonas');
    var bandeja = el('div', { class: 'bandeja', 'aria-label': 'Objetos' });
    var lista = el('ul', { class: 'frases-plano', 'aria-live': 'polite' });
    var zonas = v.zones.map(function (z) {
      var b = el('button', { type: 'button', class: 'zona' + (z.label_pos === 'above' ? ' arriba' : ''), 'data-zona': z.id, style: 'left:' + z.x + '%;top:' + z.y + '%', 'aria-label': z.label, html: '<span class="zl">' + escH(z.label) + '</span>' });
      b.addEventListener('click', function () { var s = $('.pieza[aria-pressed="true"]', bandeja); if (s) poner(s.getAttribute('data-obj'), z); });
      esc.appendChild(b); return b;
    });
    var puestos = {};
    function poner(id, z) {
      var o = v.objects.filter(function (q) { return q.id === id; })[0];
      var verbo = o.plural ? 'están' : 'está';
      var desp = z.desp || { ventana: [0, -6], mesa: [0, -4], debajo: [0, 4], nevera: [0, 0] }[z.id] || [0, 0];
      var otros = Object.keys(puestos).filter(function (k) { return puestos[k] === z.id && k !== id; }).length;
      ponerObjeto(esc, id, z.x + desp[0] + otros * 6 - 3, z.y + desp[1]);
      var li = el('li');
      if (!puestos[id]) {
        li.innerHTML = '<small lang="en">1st mention</small> <span lang="es">' + resaltar('Hay ' + o.new + ' ' + z.label + '.') + '</span>' +
          ' <small lang="en">→ now it is known:</small> <span lang="es">' + resaltar(o.known + ' ' + verbo + ' ' + z.label + '.') + '</span>';
        decir('Hay ' + o.new + ' ' + z.label + '. ' + o.known + ' ' + verbo + ' ' + z.label + '.');
      } else {
        li.innerHTML = '<small lang="en">known, moved</small> <span lang="es">' + resaltar('Ahora ' + o.known.toLowerCase() + ' ' + verbo + ' ' + z.label + '.') + '</span>';
        decir('Ahora ' + o.known.toLowerCase() + ' ' + verbo + ' ' + z.label + '.');
      }
      lista.insertBefore(li, lista.firstChild);
      puestos[id] = z.id;
      var p = $('.pieza[data-obj="' + id + '"]', bandeja);
      if (p) { p.classList.add('puesta'); p.setAttribute('aria-pressed', 'false'); }
      zonas.forEach(function (q) { q.classList.remove('elegible'); });
    }
    v.objects.forEach(function (o) {
      var p = el('button', { type: 'button', class: 'pieza', 'data-obj': o.id, 'aria-pressed': 'false', html: '<span class="i" aria-hidden="true">' + o.icon + '</span>' + escH(o.label) });
      arrastrable(p, {
        destinos: function () { return zonas; },
        soltar: function (d) { poner(o.id, v.zones.filter(function (z) { return z.id === d.getAttribute('data-zona'); })[0]); },
        tocar: function () { $$('.pieza', bandeja).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); p.setAttribute('aria-pressed', 'true'); zonas.forEach(function (q) { q.classList.add('elegible'); }); }
      });
      bandeja.appendChild(p);
    });
    cont.innerHTML = '';
    cont.appendChild(bandeja); cont.appendChild(esc); cont.appendChild(lista);
  }

  /* ---------- tipos de vocabulario ---------- */
  // ordenar el diálogo con ↑ ↓ (como «ordenar» de lecturas)
  function rOrdenarDialogo(api) {
    var e = api.e, pasos = e.steps.slice(), orden = mezclar(pasos.map(function (_, k) { return k; }), e.id);
    if (orden.every(function (x, k) { return x === k; })) orden.reverse();
    var lista = el('ol', { class: 'orden-dialogo' }), info = el('div', { 'aria-live': 'polite' }), intentos = 0, hecho = false;
    function fila(k) {
      var t = pasos[k], m = t.match(/^([^:]{1,40}):\s*(.*)$/);
      var li = el('li', { 'data-k': k });
      li.appendChild(el('span', { class: 'txt', lang: 'es', html: m ? '<b>' + escH(m[1]) + ':</b> ' + escH(m[2]) : escH(t) }));
      var bs = el('span', { class: 'mover' });
      bs.appendChild(el('button', { type: 'button', class: 'arriba', 'aria-label': 'Subir', text: '↑', onclick: function () { if (!hecho && li.previousElementSibling) { lista.insertBefore(li, li.previousElementSibling); this.focus(); } } }));
      bs.appendChild(el('button', { type: 'button', class: 'abajo', 'aria-label': 'Bajar', text: '↓', onclick: function () { if (!hecho && li.nextElementSibling) { lista.insertBefore(li.nextElementSibling, li); this.focus(); } } }));
      li.appendChild(bs);
      return li;
    }
    orden.forEach(function (k) { lista.appendChild(fila(k)); });
    var btn = el('button', { type: 'button', class: 'btn', text: 'Comprobar el orden' });
    var sol = el('button', { type: 'button', class: 'btn sec', text: 'Ver la solución', hidden: '' });
    function marcar() {
      var lis = $$('li', lista), bien = 0;
      lis.forEach(function (li, pos) { var ok = +li.getAttribute('data-k') === pos; li.classList.toggle('ok', ok); li.classList.toggle('mal', !ok); if (ok) bien++; });
      return bien === lis.length ? true : bien;
    }
    function terminar(ok) {
      hecho = true; btn.disabled = true; sol.hidden = true;
      $$('.mover button', lista).forEach(function (b) { b.disabled = true; });
      info.innerHTML = ''; info.appendChild(fb(ok ? 'ok' : 'mal', ok ? '¡Correcto!' : 'Este es el orden correcto.', e.feedback_en || ''));
      api.item(ok && intentos === 1);
    }
    btn.addEventListener('click', function () {
      intentos++;
      var r = marcar();
      if (r === true) return terminar(true);
      info.innerHTML = ''; info.appendChild(fb('mal', 'Todavía no.', r + ' of ' + pasos.length + ' lines are in the right place (green). Move the red ones.'));
      if (intentos >= 2) sol.hidden = false;
    });
    sol.addEventListener('click', function () {
      pasos.forEach(function (_, k) { lista.appendChild($('li[data-k="' + k + '"]', lista)); });
      marcar(); terminar(false);
    });
    api.cuerpo.appendChild(lista);
    api.cuerpo.appendChild(el('p', { class: 'acciones' }, [btn, ' ', sol]));
    api.cuerpo.appendChild(info);
  }

  // dictado: 🔊 + escribir; tolera la tilde con aviso; acepta variantes (accept)
  function rDictado(api, it, i) {
    var f = el('fieldset', { class: 'item', 'data-i': i });
    var pre = el('legend', { class: 'preg' });
    pre.innerHTML = '<span class="n">' + (i + 1) + '.</span>';
    pre.appendChild(el('button', { type: 'button', class: 'son escuchar', 'data-decir': it.say, 'aria-label': 'Escuchar ' + (i + 1), text: '🔊 Escuchar' }));
    pre.appendChild(el('span', { lang: 'en', text: ' ' + String(it.prompt || '').replace(/^🔊\s*/, '') }));
    f.appendChild(pre);
    var caja = el('div', { class: 'escribir' });
    var inp = el('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Lo que oyes ' + (i + 1), lang: 'es' });
    var btn = el('button', { type: 'button', class: 'btn', text: 'Comprobar' });
    caja.appendChild(inp); caja.appendChild(btn); f.appendChild(caja);
    var acepta = (it.accept && it.accept.length ? it.accept : [it.answer]);
    var intentos = 0, msg = null;
    function comprobar() {
      if (inp.disabled) return;
      var v = inp.value.trim(); if (!v) { inp.focus(); return; }
      intentos++;
      var r = 'no';
      acepta.forEach(function (a) { var c = comparar(v, a); if (c === 'exacto' || (c === 'tilde' && r === 'no')) r = c; });
      if (msg) msg.remove();
      if (r !== 'no') {
        fin(true);
        msg = r === 'exacto' ? fb('ok', '¡Correcto!', it.feedback_en) : fb('casi', '¡Correcto! Ojo con la tilde:', '');
        if (r === 'tilde') msg.innerHTML += ' <b lang="es">' + escH(it.answer) + '</b>. <span lang="en">' + escH(it.feedback_en || '') + '</span>';
        f.appendChild(msg); api.item(intentos === 1);
      } else if (intentos < 2) {
        caja.classList.add('mal'); f.classList.add('shake'); setTimeout(function () { f.classList.remove('shake'); }, 450);
        msg = fb('mal', 'Todavía no.', 'Listen again (🔊) and try once more.'); f.appendChild(msg); inp.select();
      } else {
        fin(false);
        msg = fb('mal', 'Se escribe:', ''); msg.innerHTML += ' <b lang="es">' + escH(it.answer) + '</b>. <span lang="en">' + escH(it.feedback_en || '') + '</span>';
        f.appendChild(msg); api.item(false);
      }
    }
    function fin(ok) { inp.disabled = true; btn.disabled = true; caja.classList.remove('mal'); caja.classList.add(ok ? 'ok' : 'mal'); f.classList.add(ok ? 'ok' : 'mal'); }
    btn.addEventListener('click', comprobar);
    inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); comprobar(); } });
    api.cuerpo.appendChild(f);
  }

  // hablar («Dilo tú»): reconocimiento de voz es-US; coincidencia flexible por palabras
  var Reco = window.SpeechRecognition || window.webkitSpeechRecognition;
  function parecido(dicho, frase) {
    var a = sinTildes(dicho).split(' ').filter(Boolean), b = sinTildes(frase).split(' ').filter(Boolean);
    if (!b.length) return 0;
    var hit = b.filter(function (w) { return a.indexOf(w) >= 0; }).length;
    return hit / b.length;
  }
  function rHablar(api, it, i) {
    var e = api.e, f = el('fieldset', { class: 'item hablar', 'data-i': i });
    var pre = el('legend', { class: 'preg', html: '<span class="n">' + (i + 1) + '.</span><span lang="en">' + escH(it.context_en || '') + '</span>' });
    f.appendChild(pre);
    var frase = el('p', { class: 'frase-modelo' });
    frase.appendChild(el('span', { lang: 'es', text: it.phrase }));
    frase.appendChild(el('button', { type: 'button', class: 'son', 'data-decir': it.phrase, 'aria-label': 'Escuchar el modelo', text: '🔊' }));
    f.appendChild(frase);
    var mic = el('button', { type: 'button', class: 'btn mic', text: '🎤 Hablar' });
    var yo = el('button', { type: 'button', class: 'btn sec', text: 'Ya lo dije', title: 'Mark as done without the microphone' });
    var acc = el('p', { class: 'acciones' }, [mic, ' ', yo]);
    f.appendChild(acc);
    var info = el('div', { 'aria-live': 'polite' }); f.appendChild(info);
    var intentos = 0, listo = false, oyendo = false;
    function fin(ok, txt) {
      if (listo) return; listo = true; mic.disabled = true; yo.disabled = true; f.classList.add(ok ? 'ok' : 'mal');
      info.innerHTML = ''; info.appendChild(fb(ok ? 'ok' : 'casi', ok ? '¡Muy bien!' : 'Bien, sigue practicando.', txt));
      api.item(ok && intentos <= 1);
    }
    yo.addEventListener('click', function () { fin(false, 'Compare with the model: «' + it.phrase + '».'); });
    mic.addEventListener('click', function () {
      if (oyendo || listo || !Reco) return;
      var r; try { r = new Reco(); } catch (err) { return; }
      r.lang = e.locale || 'es-US'; r.interimResults = false; r.maxAlternatives = 3;
      oyendo = true; mic.textContent = '🎙 Escuchando…'; mic.classList.add('oyendo');
      r.onresult = function (ev) {
        intentos++;
        var alts = [].slice.call(ev.results[0]).map(function (x) { return x.transcript; });
        var mejor = alts.map(function (t) { return [t, parecido(t, it.phrase)]; }).sort(function (a, b) { return b[1] - a[1]; })[0];
        if (mejor[1] >= 0.6) fin(true, 'We heard: «' + mejor[0] + '».');
        else { info.innerHTML = ''; info.appendChild(fb('mal', 'Otra vez.', 'We heard: «' + mejor[0] + '». Listen to the model (🔊) and try again.')); if (intentos >= 3) fin(false, 'Model: «' + it.phrase + '».'); }
      };
      r.onerror = function (ev) { info.innerHTML = ''; info.appendChild(fb('mal', 'No te oímos.', ev.error === 'not-allowed' ? 'Allow the microphone, or press «Ya lo dije».' : 'Try again, or press «Ya lo dije».')); };
      r.onend = function () { oyendo = false; mic.classList.remove('oyendo'); mic.textContent = '🎤 Hablar'; };
      try { r.start(); } catch (err) { oyendo = false; }
    });
    api.cuerpo.appendChild(f);
  }

  /* ---------- diálogo de muestra y texto ---------- */
  function iniciarDialogo(d) {
    var caja = $('.dialogo'); if (!caja || !d.dialogue_sample) return;
    var ds = d.dialogue_sample, lis = $$('.dlinea', caja);
    function partes(rate) { var vs = vocesDialogo(ds.speakers); return ds.lines.map(function (l) { var x = vs[l.speaker] || {}; return { t: l.es, v: x.v, pitch: x.pitch, rate: rate, pausa: 450 }; }); }
    var bPlay = $('.d-play', caja), bLento = $('.d-lento', caja), bStop = $('.d-stop', caja), estado = $('.d-estado', caja);
    function marcar(k) { lis.forEach(function (li, j) { li.classList.toggle('sonando', j === k); }); if (lis[k] && lis[k].scrollIntoView && lis[k].getBoundingClientRect().top > innerHeight - 80) lis[k].scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    function reset() { marcar(-1); bStop.hidden = true; estado.textContent = ''; }
    function tocar(rate) { bStop.hidden = false; estado.textContent = rate < 0.85 ? 'Despacio…' : 'Reproduciendo…'; decirCola(partes(rate), marcar, reset); }
    if (bPlay) bPlay.addEventListener('click', function () { tocar(0.92); });
    if (bLento) bLento.addEventListener('click', function () { tocar(0.7); });
    if (bStop) bStop.addEventListener('click', function () { pararCola(); reset(); });
    lis.forEach(function (li, k) {
      var b = $('.son', li); if (!b) return;
      b.addEventListener('click', function (ev) { ev.stopPropagation(); var p = partes(0.92)[k]; pararCola(); marcar(k); decirCola([p], null, function () { marcar(-1); }); });
    });
    var ing = $('.d-ingles', caja);
    if (ing) ing.addEventListener('click', function () { var on = ing.getAttribute('aria-pressed') !== 'true'; ing.setAttribute('aria-pressed', on ? 'true' : 'false'); caja.classList.toggle('con-ingles', on); });
    window.addEventListener('pagehide', pararCola);
  }
  function iniciarTexto() {
    var b = $('.t-play'), s = $('.t-stop'), t = $('.contexto-texto'); if (!b || !t) return;
    var frases = (t.textContent.match(/[^.!?¿¡]*[¿¡]?[^.!?]*[.!?]+|\S[^.!?]*$/g) || [t.textContent]).map(function (x) { return x.trim(); }).filter(Boolean);
    b.addEventListener('click', function () { s.hidden = false; decirCola(frases.map(function (x) { return { t: x, pausa: 250 }; }), null, function () { s.hidden = true; }); });
    s.addEventListener('click', function () { pararCola(); s.hidden = true; });
  }

  /* ---------- arranque ---------- */
  function iniciar() {
    actualizarVoz();
    if ('speechSynthesis' in window) window.speechSynthesis.addEventListener && window.speechSynthesis.addEventListener('voiceschanged', actualizarVoz);
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-decir]');
      if (b) decir(b.getAttribute('data-decir'));
    });
    var nodo = $('#datos-tema') || $('#datos-ficha');
    if (!nodo) return;
    var d;
    try { d = JSON.parse(nodo.textContent); } catch (err) { return; }
    prepararColores(d.color_code);
    if (d.visual && d.visual.type === 'plano') { var c = $('.plano'); if (c) plano(c, d.visual); }
    iniciarDialogo(d); iniciarTexto();
    var cont = $('#ejercicios');
    cont.innerHTML = '';
    // «Dilo tú» necesita reconocimiento de voz: si el navegador no lo tiene, no se muestra
    if (!Reco) d.exercises = d.exercises.filter(function (e) { return e.type !== 'hablar'; });
    total = d.exercises.length; hechos = 0; progreso();
    d.exercises.forEach(function (e, k) { Ejercicio(e, k + 1, d.color_code, cont); });
    window.__gramatica = window.__vocabulario = { datos: d, comparar: comparar };
  }
  // Tema protegido: se espera a que acceso-alumnos.js descifre el contenido (evento 'acceso:contenido').
  function arrancar() {
    if (window.EdisonAcceso && window.EdisonAcceso.pendiente()) document.addEventListener('acceso:contenido', iniciar, { once: true });
    else iniciar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();
})();
