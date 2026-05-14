const CACHE_NAME = "jantz-tv-cache-v1";

const FILES_TO_CACHE = [
	"./",
	"./index.html",
	"./style.css",
	"./script.js",
	"./manifest.json",
	"./icons/icon-192.png",
	"./icons/icon-512.png"
];

self.addEventListener("install", function(event) {
	event.waitUntil(
		caches.open(CACHE_NAME).then(function(cache) {
			return cache.addAll(FILES_TO_CACHE);
		})
	);

	self.skipWaiting();
});

self.addEventListener("activate", function(event) {
	event.waitUntil(
		caches.keys().then(function(cacheNames) {
			return Promise.all(
				cacheNames.map(function(cacheName) {
					if (cacheName !== CACHE_NAME) {
						return caches.delete(cacheName);
					}
				})
			);
		})
	);

	self.clients.claim();
});

self.addEventListener("fetch", function(event) {
	const requestUrl = new URL(event.request.url);

	if (
		requestUrl.hostname.includes("googleapis.com") ||
		requestUrl.hostname.includes("youtube.com") ||
		requestUrl.hostname.includes("ytimg.com")
	) {
		return;
	}

	event.respondWith(
		caches.match(event.request).then(function(cachedResponse) {
			return cachedResponse || fetch(event.request);
		})
	);
});