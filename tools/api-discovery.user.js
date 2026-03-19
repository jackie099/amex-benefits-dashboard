// ==UserScript==
// @name         Amex API Discovery
// @namespace    https://github.com/amex-benefits-dashboard
// @version      0.1.0
// @description  Capture API schemas for benefits dashboard development
// @match        https://global.americanexpress.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const TARGET_ENDPOINTS = [
    'ReadLoyaltyAccounts.v1',
    'ReadBestLoyaltyBenefitsTrackers.v1',
    'ReadLoyaltyBenefitsCardProduct.v1',
    'ReadLoyaltyBenefits.v2',
  ];

  const captured = {};

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const [url, options] = args;
    const urlStr = typeof url === 'string' ? url : url.url;

    const matchedEndpoint = TARGET_ENDPOINTS.find((ep) => urlStr.includes(ep));

    if (matchedEndpoint) {
      let requestBody = null;
      if (options && options.body) {
        try {
          requestBody = JSON.parse(options.body);
        } catch {
          requestBody = options.body;
        }
      }

      const response = await originalFetch.apply(this, args);
      const clone = response.clone();

      try {
        const responseBody = await clone.json();

        if (!captured[matchedEndpoint]) {
          captured[matchedEndpoint] = [];
        }
        captured[matchedEndpoint].push({
          url: urlStr,
          method: options?.method || 'GET',
          headers: Object.fromEntries(
            Object.entries(options?.headers || {}).filter(
              ([k]) => !k.toLowerCase().includes('cookie')
            )
          ),
          requestBody,
          responseBody,
          status: response.status,
        });

        console.group(`[API Discovery] ${matchedEndpoint}`);
        console.log('Request:', JSON.stringify(requestBody, null, 2));
        console.log('Response:', JSON.stringify(responseBody, null, 2));
        console.log('Status:', response.status);
        console.groupEnd();
      } catch (e) {
        console.warn(`[API Discovery] Failed to parse response for ${matchedEndpoint}:`, e);
      }

      return response;
    }

    return originalFetch.apply(this, args);
  };

  // Expose a helper to dump all captured data
  window.__amexApiDump = () => {
    console.log('[API Discovery] Full dump:');
    console.log(JSON.stringify(captured, null, 2));
    return captured;
  };

  console.log('[API Discovery] Monitoring:', TARGET_ENDPOINTS.join(', '));
  console.log('[API Discovery] Navigate to a card benefits page to capture data.');
  console.log('[API Discovery] Call window.__amexApiDump() to get all captured data.');
})();
