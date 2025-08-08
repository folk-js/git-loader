import FS from 'https://esm.sh/@isomorphic-git/lightning-fs';
import { Buffer } from 'https://esm.sh/buffer';
import { fileTypeFromBuffer } from 'https://esm.sh/file-type';
import * as git from 'https://esm.sh/isomorphic-git';
import http from 'https://esm.sh/isomorphic-git/http/web';

// Need to polyfill buffer
self.Buffer = Buffer;

const fs = new FS('fs');

const fsp = fs.promises;

const DIR = '/repos';
const REPO = 'https://github.com/ChrisShank/chrisshank.com';
const CACHE_NAME = 'v1';

async function exists(dir) {
  return fsp
    .stat(dir)
    .then(() => true)
    .catch(() => false);
}

async function clearOldCaches() {
  const cacheWhitelist = [CACHE_NAME];
  const cacheNames = await caches.keys();
  const deletePromises = cacheNames.map((cacheName) => {
    if (!cacheWhitelist.includes(cacheName)) {
      return caches.delete(cacheName);
    }
  });
  await Promise.all(deletePromises);
}

async function cloneRepo(dir, url) {
  if (await exists(`${dir}/.git`)) return;

  await fsp.mkdir(dir);
  await git.clone({ fs, http, dir, url, corsProxy: 'https://cors.isomorphic-git.org' });
  console.log(await fsp.readdir(dir));
}

self.addEventListener('install', (event) => {
  console.log('Installing SW');
  event.waitUntil(cloneRepo(DIR, REPO).then(() => self.skipWaiting()));
});

self.addEventListener('activate', async (event) => {
  console.log('Activating service worker.');
  event.waitUntil(clearOldCaches().then(() => self.clients.claim()));
});

self.addEventListener('fetch', async (event) => {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) return;

  console.log(url);

  try {
    const file = await fsp.readFile(url.pathname);
    const contentType = await fileTypeFromBuffer(file).then((fileType) => fileType?.mime);

    event.respondWith(
      new Response(file, {
        headers: { 'Content-Type': contentType },
      })
    );
  } catch (error) {
    console.error(error);

    event.respondWith(
      new Response(`The path couldn't be resolved to a valid document.`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      })
    );
  }
});
