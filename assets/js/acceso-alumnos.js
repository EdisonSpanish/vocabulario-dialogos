/* acceso-alumnos.js — acceso con contraseña para alumnos de Edison Spanish (lecturas, gramática, vocabulario, juegos).
   Mismo archivo en todos los sitios; el build sustituye {"v": 1, "salt": "Sui9BdWdCovUhC7y/GwSyg==", "iter": 310000, "token": {"acceso_cifrado": 1, "alg": "AES-256-GCM", "kdf": "PBKDF2-SHA256+HKDF-SHA256", "s": "HflP5kq6N6ZYLEZqbjYw0A==", "iv": "caw4qcVsik4E4pzq", "ct": "896zc5/tUEMJqzsfm2WMSOBHmhu0BJEp9MdHVX05ZuyLn3CCVjpvjw=="}, "tokenTexto": "edisonspanish:alumnos:ok"} (sal global, iteraciones y token de verificación).
   - La contraseña nunca está en este archivo: se comprueba descifrando un token conocido (PBKDF2-SHA256 → HKDF → AES-256-GCM).
   - Si es correcta se guarda la LLAVE derivada (no la contraseña) en una cookie común a *.edisonspanish.com (30 días);
     en localhost / 127.0.0.1 (pruebas) y en otros dominios, en localStorage.
   - Contenido cifrado en la página: <script type="application/x-acceso-cifrado" data-acceso-bloque>{sobre}</script>
     → al desbloquear se sustituye por el HTML descifrado y se lanza el evento 'acceso:contenido'.
   - PDFs: <a data-acceso-pdf="ruta.bin" data-nombre="ficha.pdf"> → se descarga descifrado.
   API: window.EdisonAcceso = { pendiente(), desbloqueado(), probar(pw), descifrarJSON(o), descifrarTexto(o), abrir(), salir(), listo } */
(function () {
  'use strict';
  var CFG = {"v": 1, "salt": "Sui9BdWdCovUhC7y/GwSyg==", "iter": 310000, "token": {"acceso_cifrado": 1, "alg": "AES-256-GCM", "kdf": "PBKDF2-SHA256+HKDF-SHA256", "s": "HflP5kq6N6ZYLEZqbjYw0A==", "iv": "caw4qcVsik4E4pzq", "ct": "896zc5/tUEMJqzsfm2WMSOBHmhu0BJEp9MdHVX05ZuyLn3CCVjpvjw=="}, "tokenTexto": "edisonspanish:alumnos:ok"};
  var NOMBRE = 'es_alumnos';
  var DOMINIO = 'edisonspanish.com';
  var INFO = 'edisonspanish-alumnos-v1';
  var CLASES = 'https://www.edisonspanish.com/';
  var enc = new TextEncoder(), dec = new TextDecoder();
  var subtle = window.crypto && window.crypto.subtle;
  var llave = null;               // Uint8Array(32) cuando el alumno está dentro
  var hkdfBase = null;            // CryptoKey HKDF importada de la llave

  /* ---------- base64 ---------- */
  function deB64(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function aB64(u) { var s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

  /* ---------- almacenamiento compartido ---------- */
  function esDominioPropio() { var h = location.hostname; return h === DOMINIO || h.slice(-(DOMINIO.length + 1)) === '.' + DOMINIO; }
  function leerGuardada() {
    if (esDominioPropio()) {
      var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + NOMBRE + '=([^;]+)'));
      return m ? decodeURIComponent(m[1]) : null;
    }
    try { return localStorage.getItem(NOMBRE); } catch (e) { return null; }
  }
  function guardar(v) {
    if (esDominioPropio()) document.cookie = NOMBRE + '=' + encodeURIComponent(v) + '; domain=.' + DOMINIO + '; path=/; max-age=2592000; SameSite=Lax; Secure';
    else try { localStorage.setItem(NOMBRE, v); } catch (e) {}
  }
  function borrar() {
    if (esDominioPropio()) document.cookie = NOMBRE + '=; domain=.' + DOMINIO + '; path=/; max-age=0; SameSite=Lax; Secure';
    try { localStorage.removeItem(NOMBRE); } catch (e) {}
  }

  /* ---------- criptografía ---------- */
  function usarLlave(bytes) {
    return subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']).then(function (k) { llave = bytes; hkdfBase = k; });
  }
  function claveDe(sal) {
    return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: sal, info: enc.encode(INFO) }, hkdfBase, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  }
  function descifrarPartes(sal, iv, ct) {
    if (!hkdfBase) return Promise.reject(new Error('bloqueado'));
    return claveDe(sal).then(function (k) { return subtle.decrypt({ name: 'AES-GCM', iv: iv }, k, ct); });
  }
  function descifrarTexto(o) { return descifrarPartes(deB64(o.s), deB64(o.iv), deB64(o.ct)).then(function (b) { return dec.decode(b); }); }
  function descifrarJSON(o) { return descifrarTexto(o).then(JSON.parse); }
  function descifrarBinario(buf) {
    var u = new Uint8Array(buf);
    if (dec.decode(u.slice(0, 4)) !== 'ESA1') return Promise.reject(new Error('formato'));
    return descifrarPartes(u.slice(4, 20), u.slice(20, 32), u.slice(32));
  }
  function verificar() { return descifrarTexto(CFG.token).then(function (t) { if (t !== CFG.tokenTexto) throw new Error('token'); }); }
  function derivar(pw) {
    return subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: deB64(CFG.salt), iterations: CFG.iter }, k, 256);
    }).then(function (b) { return new Uint8Array(b); });
  }
  function probar(pw) {
    if (!subtle) return Promise.resolve(false);
    var antes = [llave, hkdfBase];
    return derivar(String(pw || '')).then(usarLlave).then(verificar).then(function () {
      guardar(aB64(llave)); return true;
    }).catch(function () { llave = antes[0]; hkdfBase = antes[1]; return false; });
  }
  function salir() { borrar(); llave = hkdfBase = null; location.reload(); }

  /* ---------- página ---------- */
  var resolverListo, listo = new Promise(function (r) { resolverListo = r; });
  function bloques() { return Array.prototype.slice.call(document.querySelectorAll('script[data-acceso-bloque]')); }
  function pendiente() { return bloques().length > 0; }
  function marcar(dentro) {
    var html = document.documentElement;
    html.classList.toggle('acceso-alumno', !!dentro);
    html.classList.toggle('acceso-visitante', !dentro);
    document.querySelectorAll('[data-acceso-salir]').forEach(function (b) { b.hidden = !dentro; });
    document.querySelectorAll('.acceso-btn[data-acceso-abrir]').forEach(function (b) { b.hidden = !!dentro; });
  }
  function abrirBloques() {
    var bs = bloques();
    return Promise.all(bs.map(function (s) {
      return descifrarTexto(JSON.parse(s.textContent)).then(function (html) {
        var t = document.createElement('template'); t.innerHTML = html;
        s.parentNode.replaceChild(t.content, s);
      });
    })).then(function () {
      document.querySelectorAll('[data-acceso-gate]').forEach(function (g) { g.remove(); });
      if (bs.length) document.dispatchEvent(new CustomEvent('acceso:contenido'));
    });
  }
  function entrar() {
    marcar(true);
    return abrirBloques().then(function () { resolverListo(true); document.dispatchEvent(new CustomEvent('acceso:entrada')); });
  }

  /* ---------- formulario (gate y modal) ---------- */
  function formulario(idPrefijo) {
    var f = document.createElement('form');
    f.className = 'acceso-form'; f.setAttribute('data-acceso-form', ''); f.setAttribute('novalidate', ''); f.lang = 'en';
    f.innerHTML = '<label for="' + idPrefijo + '-pw">Student password</label>' +
      '<div class="acceso-fila"><input id="' + idPrefijo + '-pw" name="pw" type="password" autocomplete="current-password" required>' +
      '<button class="acceso-entrar" type="submit">Unlock</button></div>' +
      '<p class="acceso-error" role="alert" hidden>That password is not correct. Check it and try again.</p>';
    return f;
  }
  function conectar(f, alEntrar) {
    if (f.__acceso) return; f.__acceso = true;
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var inp = f.querySelector('input[type=password]'), err = f.querySelector('.acceso-error'), btn = f.querySelector('button[type=submit]');
      err.hidden = true; btn.disabled = true; btn.textContent = 'Checking…';
      probar(inp.value).then(function (ok) {
        btn.disabled = false; btn.textContent = 'Unlock';
        if (!ok) { err.hidden = false; inp.select(); return; }
        if (window.gtag) gtag('event', 'acceso_alumno', { sitio: location.hostname });
        entrar().then(function () { if (alEntrar) alEntrar(); });
      });
    });
  }
  var modal = null;
  function abrir() {
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'acceso-modal'; modal.hidden = true;
      modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'acceso-modal-t');
      modal.innerHTML = '<div class="acceso-caja" lang="en"><button type="button" class="acceso-cerrar" aria-label="Close">×</button>' +
        '<h2 id="acceso-modal-t">🔑 Student access</h2>' +
        '<p>Enter the password Edison gave you in class. It unlocks Lecturas, Gramática and Vocabulario on this device for 30 days.</p></div>';
      var caja = modal.firstChild, f = formulario('acceso-modal');
      caja.appendChild(f);
      var p = document.createElement('p'); p.className = 'acceso-cta';
      p.innerHTML = 'Not a student yet? <a href="' + CLASES + '">Book a trial class</a>';
      caja.appendChild(p);
      document.body.appendChild(modal);
      conectar(f, cerrar);
      modal.addEventListener('click', function (e) { if (e.target === modal || e.target.closest('.acceso-cerrar')) cerrar(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) cerrar(); });
    }
    modal.hidden = false;
    setTimeout(function () { modal.querySelector('input').focus(); }, 30);
  }
  function cerrar() { if (modal) modal.hidden = true; }

  function descargarPdf(a) {
    var ruta = a.getAttribute('data-acceso-pdf'), nombre = a.getAttribute('data-nombre') || 'ficha.pdf';
    var txt = a.innerHTML; a.setAttribute('aria-busy', 'true');
    fetch(ruta).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(descifrarBinario).then(function (pdf) {
        var url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
        var d = document.createElement('a'); d.href = url; d.download = nombre; document.body.appendChild(d); d.click(); d.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        if (window.gtag) gtag('event', 'pdf_alumno', { archivo: nombre });
      }).catch(function () { alert('The PDF could not be opened. Please try again.'); })
      .then(function () { a.removeAttribute('aria-busy'); a.innerHTML = txt; });
  }

  function iniciar() {
    document.querySelectorAll('[data-acceso-gate] [data-acceso-hueco]').forEach(function (h, i) {
      var f = formulario('acceso-gate-' + i); h.parentNode.replaceChild(f, h); conectar(f);
    });
    document.addEventListener('click', function (ev) {
      var t = ev.target.closest && ev.target.closest('[data-acceso-abrir],[data-acceso-salir],[data-acceso-pdf]');
      if (!t) return;
      if (t.hasAttribute('data-acceso-salir')) { ev.preventDefault(); salir(); return; }
      if (t.hasAttribute('data-acceso-pdf')) { ev.preventDefault(); if (llave) descargarPdf(t); else abrir(); return; }
      ev.preventDefault(); abrir();
    });
    var g = leerGuardada();
    if (!g || !subtle) { marcar(false); resolverListo(false); return; }
    var bytes; try { bytes = deB64(g); } catch (e) { bytes = null; }
    if (!bytes || bytes.length !== 32) { borrar(); marcar(false); resolverListo(false); return; }
    usarLlave(bytes).then(verificar).then(entrar).catch(function () {
      borrar(); llave = hkdfBase = null; marcar(false); resolverListo(false);   // contraseña cambiada: hay que volver a entrar
    });
  }

  window.EdisonAcceso = {
    pendiente: pendiente, desbloqueado: function () { return !!llave; }, probar: probar,
    descifrarJSON: descifrarJSON, descifrarTexto: descifrarTexto, abrir: abrir, salir: salir, listo: listo,
    esCifrado: function (o) { return !!(o && o.acceso_cifrado === 1 && o.ct); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
