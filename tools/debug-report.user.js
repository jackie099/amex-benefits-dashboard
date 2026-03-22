// ==UserScript==
// @name         Amex Benefits Debug
// @namespace    https://github.com/amex-benefits-dashboard
// @version      0.1
// @description  Debug tool — captures card & tracker data for troubleshooting
// @match        https://global.americanexpress.com/*
// @match        https://www.americanexpress.com/*
// @grant        none
// @run-at       document-start
// @inject-into  page
// @sandbox      raw
// ==/UserScript==

(function () {
  'use strict';

  var capturedCards = [];
  var capturedTrackers = [];
  var capturedTokens = [];
  var logs = [];

  function log(msg) {
    var ts = new Date().toISOString().slice(11, 23);
    logs.push('[' + ts + '] ' + msg);
  }

  log('Debug script loaded | readyState=' + document.readyState + ' | fetch=' + (typeof window.fetch));

  // Intercept fetch
  var originalFetch = window.fetch;
  if (!originalFetch) {
    log('ERROR: window.fetch not available at document-start');
  } else {
    log('Fetch interceptor installing...');
    window.fetch = function () {
      var url = typeof arguments[0] === 'string' ? arguments[0] : (arguments[0] && arguments[0].url) || '';
      if (url.indexOf('functions.americanexpress.com') === -1) {
        return originalFetch.apply(this, arguments);
      }

      var endpoint = url.split('/').pop();
      log('API call: ' + endpoint);

      return originalFetch.apply(this, arguments).then(function (response) {
        try {
          var clone = response.clone();
          clone.text().then(function (text) {
            try {
              // Capture tokens
              if (text.indexOf('accountToken') !== -1) {
                var re = /\"accountToken\"\s*:\s*\"([A-Z0-9]{10,20})\"/g;
                var m;
                while ((m = re.exec(text)) !== null) {
                  if (capturedTokens.indexOf(m[1]) === -1) capturedTokens.push(m[1]);
                }
              }
              // Capture card details
              if (url.indexOf('ReadLoyaltyBenefitsCardProduct') !== -1) {
                var data = JSON.parse(text);
                if (data && data.cardDetails) {
                  capturedCards = data.cardDetails.map(function (c) {
                    return {
                      cardName: c.cardName,
                      accountToken: c.accountToken.slice(0, 6) + '...',
                      cardType: c.cardType,
                      relationship: c.relationship,
                    };
                  });
                  log('Cards found: ' + capturedCards.length);
                }
              }
              // Capture tracker summary
              if (url.indexOf('ReadBestLoyaltyBenefitsTrackers') !== -1) {
                var tData = JSON.parse(text);
                if (Array.isArray(tData)) {
                  tData.forEach(function (entry) {
                    var tokenShort = entry.accountToken ? entry.accountToken.slice(0, 6) + '...' : '???';
                    var trackers = entry.trackers || [];
                    var byCategory = {};
                    var benefitList = [];
                    trackers.forEach(function (t) {
                      byCategory[t.category] = (byCategory[t.category] || 0) + 1;
                      benefitList.push({
                        id: t.benefitId,
                        name: t.benefitName,
                        category: t.category,
                        duration: t.trackerDuration,
                        target: t.tracker ? t.tracker.targetAmount : 'N/A',
                        spent: t.tracker ? t.tracker.spentAmount : 'N/A',
                        period: (t.periodStartDate || '').slice(0, 10) + ' to ' + (t.periodEndDate || '').slice(0, 10),
                      });
                    });
                    capturedTrackers.push({
                      token: tokenShort,
                      total: trackers.length,
                      categories: byCategory,
                      benefits: benefitList,
                    });
                    var catStr = Object.entries(byCategory).map(function (e) { return e[0] + ':' + e[1]; }).join(', ');
                    log('Trackers for ' + tokenShort + ': ' + trackers.length + ' (' + catStr + ')');
                  });
                }
              }
            } catch (e) {
              log('Parse error for ' + endpoint + ': ' + e.message);
            }
          }).catch(function () {});
        } catch (e) {}
        return response;
      });
    };
    log('Fetch interceptor installed');
  }

  // UI
  document.addEventListener('DOMContentLoaded', function () {
    log('DOMContentLoaded fired');

    var btn = document.createElement('button');
    btn.textContent = 'AmexDash Debug Report';
    btn.style.cssText = 'position:fixed;bottom:70px;left:24px;z-index:99999;background:#c62828;color:#fff;border:none;padding:12px 24px;border-radius:24px;cursor:pointer;font-size:14px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:-apple-system,sans-serif;';
    btn.addEventListener('click', showReport);
    document.body.appendChild(btn);

    function showReport() {
      // Build report
      var report = [];
      report.push('=== AmexDash Debug Report ===');
      report.push('Generated: ' + new Date().toISOString());
      report.push('URL: ' + location.href);
      report.push('UserAgent: ' + navigator.userAgent);
      report.push('');

      report.push('--- Logs ---');
      logs.forEach(function (l) { report.push(l); });
      report.push('');

      report.push('--- Cards (' + capturedCards.length + ') ---');
      capturedCards.forEach(function (c) {
        report.push('  ' + c.cardName + ' | token=' + c.accountToken + ' | type=' + c.cardType + ' | rel=' + c.relationship);
      });
      report.push('');

      report.push('--- Tokens (' + capturedTokens.length + ') ---');
      capturedTokens.forEach(function (t) { report.push('  ' + t.slice(0, 6) + '...'); });
      report.push('');

      report.push('--- Trackers ---');
      capturedTrackers.forEach(function (ct) {
        report.push('  Account ' + ct.token + ': ' + ct.total + ' trackers');
        Object.entries(ct.categories).forEach(function (e) {
          report.push('    category "' + e[0] + '": ' + e[1]);
        });
        ct.benefits.forEach(function (b) {
          report.push('    [' + b.category + '] ' + b.name + ' | id=' + b.id + ' | duration=' + b.duration + ' | ' + b.spent + '/' + b.target + ' | ' + b.period);
        });
        report.push('');
      });

      if (capturedCards.length === 0 && capturedTrackers.length === 0) {
        report.push('*** NO DATA CAPTURED ***');
        report.push('The fetch interceptor may not be working in your browser.');
        report.push('Please navigate to a card benefits page (e.g., Rewards & Benefits > Benefits)');
        report.push('then click this button again.');
      }

      var reportText = report.join('\n');

      // Show overlay
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:999999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';

      var panel = document.createElement('div');
      panel.style.cssText = 'background:#1e1e1e;color:#d4d4d4;width:90%;max-width:800px;max-height:85vh;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:Menlo,Monaco,monospace;font-size:12px;';

      // Header
      var header = document.createElement('div');
      header.style.cssText = 'background:#252526;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #333;';
      header.innerHTML = '<span style="color:#fff;font-weight:600;font-size:14px;font-family:-apple-system,sans-serif;">Debug Report</span>';

      var btnGroup = document.createElement('div');
      btnGroup.style.cssText = 'display:flex;gap:8px;';

      var copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy to Clipboard';
      copyBtn.style.cssText = 'background:#0078d4;color:#fff;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:12px;font-family:-apple-system,sans-serif;';
      copyBtn.addEventListener('click', function () {
        navigator.clipboard.writeText(reportText).then(function () {
          copyBtn.textContent = 'Copied!';
          copyBtn.style.background = '#2e7d32';
          setTimeout(function () {
            copyBtn.textContent = 'Copy to Clipboard';
            copyBtn.style.background = '#0078d4';
          }, 2000);
        });
      });

      var closeBtn = document.createElement('button');
      closeBtn.textContent = 'Close';
      closeBtn.style.cssText = 'background:#444;color:#fff;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:12px;font-family:-apple-system,sans-serif;';
      closeBtn.addEventListener('click', function () { overlay.remove(); });

      btnGroup.appendChild(copyBtn);
      btnGroup.appendChild(closeBtn);
      header.appendChild(btnGroup);

      // Content
      var content = document.createElement('pre');
      content.style.cssText = 'padding:16px;overflow:auto;flex:1;margin:0;white-space:pre-wrap;word-break:break-all;line-height:1.5;';
      content.textContent = reportText;

      panel.appendChild(header);
      panel.appendChild(content);
      overlay.appendChild(panel);
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) overlay.remove();
      });
      document.body.appendChild(overlay);
    }
  });
})();
