import FS from 'https://esm.sh/@isomorphic-git/lightning-fs?standalone';
import { Buffer } from 'https://esm.sh/buffer?standalone';
import mime from 'https://esm.sh/mime?standalone';
import * as git from 'https://esm.sh/isomorphic-git?standalone';
import http from 'https://esm.sh/isomorphic-git/http/web?standalone';

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
  if (await exists(`${dir}/.git`)) {
    console.log('Repo already cloned.');
    console.log(await fsp.readdir(dir));
    return;
  }

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

async function getResponse(url) {
  try {
    const fsPath = DIR + url.pathname;
    console.log('intercepting file request', fsPath);
    const file = await fsp.readFile(DIR + url.pathname);
    const contentType = mime.getType(url.pathname);
    return new Response(file, {
      headers: { 'Content-Type': contentType },
    });
  } catch (error) {
    console.error(error);

    if (error instanceof Error && error.message.includes('ENOENT')) {
      return new Response(`Not found`, {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    return new Response(`Internal Server Error`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

self.addEventListener('fetch', async (event) => {
  const url = new URL(event.request.url);

  console.log(url);

  // Dont intercept non-origin requests
  if (url.origin !== self.location.origin) return;

  // The URL is a directory
  if (!url.pathname.includes('.')) url.pathname += '/';

  // The URL is a directory aliasing it's index.html file
  if (url.pathname.endsWith('/')) url.pathname += 'index.html';

  const r = getResponse(url);
  event.respondWith(r);
});
