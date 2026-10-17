// Vercel Web Analytics initialization
(function() {
  'use strict';
  
  // Initialize the queue for analytics (official pattern from Vercel docs)
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  
  // Don't inject script in development (localhost)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('[Vercel Web Analytics] Skipping in development mode');
    return;
  }
  
  // Check if script already loaded
  var scriptSrc = '/_vercel/insights/script.js';
  if (document.head.querySelector('script[src*="' + scriptSrc + '"]')) {
    return;
  }
  
  // Create and inject the analytics script
  var script = document.createElement('script');
  script.src = scriptSrc;
  script.defer = true;
  script.onerror = function() {
    console.log(
      '[Vercel Web Analytics] Failed to load script. ' +
      'Be sure to enable Web Analytics for your project in the Vercel dashboard.'
    );
  };
  
  document.head.appendChild(script);
})();
