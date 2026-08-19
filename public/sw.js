const CACHE_NAME = "anime-cour-cache-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 番組データ(API)は常に最新を取りに行く。オフラインなど失敗時だけキャッシュを使う。
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  // それ以外の画面表示用ファイルは「まずキャッシュを返しつつ、裏で最新に更新」する
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

// サーバー(api/notify-check)から届いたプッシュ通知を実際に画面へ表示する
self.addEventListener("push", (event) => {
  let payload = { title: "AniCour", body: "まもなく放送の作品があります" };
  try {
    if (event.data) payload = event.data.json();
  } catch (e) {
    // JSONで無ければそのままテキストとして扱う
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "AniCour", {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "anicour-notify",
    })
  );
});

// 通知をタップしたらアプリを開く(既に開いていればそのタブにフォーカス)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
