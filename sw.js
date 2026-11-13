/* Service worker — SOS Gestion
   - Page (index.html) : réseau d'abord (mises à jour immédiates), copie locale si pas de réseau
     ou si le réseau met plus de 3 s à répondre.
   - Outils PDF, icône, manifest : copie locale d'abord (fonctionnent hors ligne).
   Changer CACHE (ex. sos-v2.1) uniquement si les outils PDF ou ce fichier changent. */

var CACHE = 'sos-v2.1';
var DELAI_RESEAU_MS = 3000;
var FICHIERS_LOCAUX = ['./', './index.html', './manifest.json', './icon.png'];
var LIBRAIRIES = [
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
];

self.addEventListener('install', function (event) {
    event.waitUntil(caches.open(CACHE).then(function (cache) {
        // Chaque fichier est mis en cache séparément : un fichier manquant ne bloque pas les autres.
        var locaux = FICHIERS_LOCAUX.map(function (url) { return cache.add(url).catch(function () {}); });
        var libs = LIBRAIRIES.map(function (url) {
            return fetch(url, { mode: 'cors' }).then(function (rep) {
                if (rep.ok) return cache.put(url, rep);
            }).catch(function () {});
        });
        return Promise.all(locaux.concat(libs));
    }));
});

self.addEventListener('activate', function (event) {
    event.waitUntil(caches.keys().then(function (cles) {
        return Promise.all(cles.filter(function (c) { return c.indexOf('sos-') === 0 && c !== CACHE; })
            .map(function (c) { return caches.delete(c); }));
    }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (event) {
    if (event.data === 'skipWaiting') self.skipWaiting();
});

function pageDepuisCache() {
    return caches.match('./index.html').then(function (r) { return r || caches.match('./'); });
}

self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (req.method !== 'GET') return;

    if (req.mode === 'navigate') {
        event.respondWith(new Promise(function (resolve) {
            var termine = false;
            function repondre(r) { if (!termine && r) { termine = true; resolve(r); } }

            var minuteur = setTimeout(function () {
                pageDepuisCache().then(repondre);
            }, DELAI_RESEAU_MS);

            fetch(req).then(function (rep) {
                clearTimeout(minuteur);
                if (rep.ok) {
                    var copie = rep.clone();
                    caches.open(CACHE).then(function (cache) { cache.put('./index.html', copie); });
                }
                repondre(rep);
            }).catch(function () {
                clearTimeout(minuteur);
                pageDepuisCache().then(function (r) {
                    repondre(r || new Response('Hors ligne : ouvrez l\'app une fois avec du réseau.',
                        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
                });
            });
        }));
        return;
    }

    var url = req.url;
    var memeOrigine = url.indexOf(self.location.origin) === 0;
    var estLibrairie = LIBRAIRIES.indexOf(url) !== -1;
    if (!memeOrigine && !estLibrairie) return;

    event.respondWith(caches.match(req, { ignoreSearch: true }).then(function (enCache) {
        if (enCache) return enCache;
        return fetch(estLibrairie ? new Request(url, { mode: 'cors' }) : req).then(function (rep) {
            if (rep.ok) {
                var copie = rep.clone();
                caches.open(CACHE).then(function (cache) { cache.put(url, copie); });
            }
            return rep;
        });
    }));
});
