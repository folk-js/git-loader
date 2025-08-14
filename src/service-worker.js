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

async function getResponse(url, request) {
  try {
    const fsPath = DIR + url.pathname;

    if (request.method === 'GET') {
      console.log('intercepting file request', fsPath);
      const file = await fsp.readFile(fsPath);
      const contentType = mime.getType(url.pathname);

      return new Response(file, {
        headers: { 'Content-Type': contentType },
      });
    } else if (request.method === 'POST') {
      const body = new Uint8Array(await request.arrayBuffer());
      await fsp.writeFile(fsPath, body);
      return new Response();
    }
  } catch (error) {
    console.error(error);

    if (error instanceof Error && error.message.includes('ENOENT')) {
      return new Response(null, {
        status: 404,
      });
    }

    return new Response(null, {
      status: 500,
    });
  }
}

function getJSONResponse(json) {
  return new Response(JSON.stringify(json), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getGitResponse(path, url, request) {
  try {
    switch (path) {
      case '/branches': {
        if (request.method === 'GET') {
          const remote = url.searchParams.get('remote') ?? undefined;
          const branches = await git.listBranches({ fs, dir: DIR, remote });
          return getJSONResponse(branches);
        }
      }
      case '/branch': {
        if (request.method === 'POST') {
          const ref = url.searchParams.get('name');

          if (ref === undefined) {
            return new Response('"name" not included as a query param', {
              status: '400',
            });
          }

          await git.branch({ fs, dir: DIR, ref });
          return new Response();
        }
      }
      case '/current-branch': {
        if (request.method === 'GET') {
          let branch = await git.currentBranch({
            fs,
            dir: DIR,
          });
          return getJSONResponse(branch);
        }
      }
      case '/log': {
        if (request.method === 'GET') {
          const depth = url.searchParams.get('depth') || undefined;
          let commits = await git.log({
            fs,
            dir: DIR,
            depth,
            ref: 'main',
          });
          return getJSONResponse(commits);
        }
      }
      case '/status': {
        if (request.method === 'GET') {
          const filepath = url.searchParams.get('filePath');

          if (filepath === undefined) {
            return new Response('"filePath" not included as a query param', {
              status: '400',
            });
          }
          const status = await git.status({ fs, dir: DIR, filepath });
          return getJSONResponse(status);
        }
      }
      case '/restore': {
        if (request.method === 'POST') {
          await git.checkout({
            fs,
            dir: DIR,
            force: true,
          });
          return new Response();
        }
      }
      default:
        return new Response(null, {
          status: 404,
        });
    }
  } catch (error) {
    console.log(error);
    return new Response(null, {
      status: 500,
    });
  }
}

self.addEventListener('fetch', async (event) => {
  const request = event.request;
  const url = new URL(event.request.url);

  console.log('original URL', url.href);

  // Dont intercept non-origin requests
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/.git')) {
    const path = url.pathname.replace('/.git', '');
    const r = getGitResponse(path, url, request);
    event.respondWith(r);
    return;
  }

  // The URL is a directory
  if (!url.pathname.includes('.') && !url.pathname.endsWith('/')) url.pathname += '/';

  // The URL is a directory aliasing it's index.html file
  if (url.pathname.endsWith('/')) url.pathname += 'index.html';

  // console.log('updated URL', url.href);
  const r = getResponse(url, request);
  event.respondWith(r);
});
