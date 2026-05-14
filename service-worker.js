const CACHE_NAME = "jantz-tv-cache-v5";

const FILES_TO_CACHE = [
	"./",
	"./index.html",
	"./style.css",
	"./script.js",
	"./manifest.json",
	"./icon-192.PNG",
	"./icon-512.PNG"
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
		requestUrl.hostname.includes("ytimg.com") ||
		requestUrl.hostname.includes("i.ytimg.com")
	) {
		return;
	}

	if (event.request.method !== "GET") {
		return;
	}

	event.respondWith(
		fetch(event.request)
		.then(function(networkResponse) {
			const responseClone = networkResponse.clone();

			caches.open(CACHE_NAME).then(function(cache) {
				cache.put(event.request, responseClone);
			});

			return networkResponse;
		})
		.catch(function() {
			return caches.match(event.request);
		})
	);
});