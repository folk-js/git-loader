function handleRedirect() {
  const redirectPath = sessionStorage.getItem('redirectPath');
  if (redirectPath) {
    console.log('Redirecting to:', redirectPath);
    sessionStorage.removeItem('redirectPath');
    window.location.href = redirectPath;
  }
}

// If we already have a controller, we can redirect immediately
if (navigator.serviceWorker.controller) {
  console.log('Service worker is already controlling the page');
  // handleRedirect();
} else {
  // Otherwise wait for a controller
  console.log('Waiting for service worker to take control...');
  try {
    await navigator.serviceWorker.register(new URL('./service-worker.js', import.meta.url), { type: 'module' });
    console.log('service worker installed!');
  } catch (error) {
    console.log('ServiceWorker registration failed: ', error);
    document.body.innerHTML = `
<h1>The git service worker proxy failed to load.</h1>
<p>If you're on Firefox, check this <a href="https://caniuse.com/mdn-api_serviceworker_ecmascript_modules">link</a> for more information and if Firefox is green now, <a href="mailto:pvh@pvh.ca">email me</a>.</p>`;
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('Service worker now controlling the page');
    // handleRedirect();
  });
}
