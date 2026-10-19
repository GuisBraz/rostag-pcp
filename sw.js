/* ---------------------------------------------------------------------------
   Service worker do ROSTAG PCP — deixa o app instalado abrir sem internet.

   Estratégia "rede primeiro": sempre tenta buscar a versão mais nova do
   site; só usa a cópia guardada quando está offline. Assim uma publicação
   nova aparece no próximo carregamento, sem ficar presa em cache.
   Os dados (Firestore) não passam por aqui: o próprio SDK guarda o cache.
--------------------------------------------------------------------------- */
const CACHE = 'rostag-pcp-v8';
const ARQUIVOS = [
  './', 'index.html', 'manifest.json', 'css/app.css', 'vendor/chart.umd.min.js',
  'img/logo.png', 'img/favicon.png', 'img/sobre.jpg', 'icon-192.png', 'icon-512.png',
  'js/main.js', 'js/estado.js',
  'js/nucleo/prefs.js', 'js/nucleo/fmt.js',
  'js/i18n/index.js', 'js/i18n/pt.js', 'js/i18n/en.js',
  'js/dominio/constantes.js', 'js/dominio/cronograma.js', 'js/dominio/projeto.js', 'js/dominio/serie.js', 'js/dominio/alertas.js',
  'js/dominio/papeis.js', 'js/dominio/producao.js', 'js/dominio/planilha.js', 'js/dominio/semana.js', 'js/dados/ops.js', 'js/ui/fabrica.js', 'js/ui/gerencia.js', 'js/dominio/carga.js', 'js/dados/carga.js', 'js/ui/carga.js',
  'js/dados/firebase.js', 'js/dados/auth.js', 'js/dados/store.js',
  'js/ui/dom.js', 'js/ui/toast.js', 'js/ui/modal.js', 'js/ui/app.js', 'js/ui/rota.js', 'js/ui/preferencias.js',
  'js/ui/painel.js', 'js/ui/graficos.js', 'js/ui/filtros.js', 'js/ui/projetos.js', 'js/ui/formulario.js',
  'js/ui/detalhe.js', 'js/ui/linha.js', 'js/ui/ano.js', 'js/ui/notificacoes.js', 'js/ui/dados.js',
  'js/ui/atalhos.js', 'js/ui/equipe.js', 'js/ui/acesso.js'
];
// SDK do Firebase (gstatic): sem ele o app não abre offline. A URL tem a
// versão, então o conteúdo nunca muda — cache primeiro. Mesmas URLs do index.html.
const SDK = [
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // o SDK não pode travar a instalação: se falhar aqui, entra no cache no primeiro uso
    return c.addAll(ARQUIVOS).then(function () {
      return Promise.all(SDK.map(function (u) { return c.add(new Request(u, { mode: 'cors' })).catch(function () {}); }));
    });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (nomes) {
    return Promise.all(nomes.filter(function (n) { return n !== CACHE; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (SDK.indexOf(req.url) >= 0) {
    e.respondWith(caches.match(req.url, { ignoreVary: true }).then(function (r) {
      return r || fetch(req).then(function (resp) {
        if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then(function (c) { c.put(req.url, copia); }); }
        return resp;
      });
    }));
    return;
  }
  // resto do Firebase, fontes e CDN: direto na rede, sem passar pelo cache daqui
  if (url.origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(function (resp) {
    if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then(function (c) { c.put(req, copia); }); }
    return resp;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (r) {
      return r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
    });
  }));
});
