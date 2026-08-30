const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const SOURCE_PATH = path.join(__dirname, '..', 'src', 'amex-benefits-dashboard.user.js');
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');

const TOKEN_A = 'AAAAAAAAAA1';
const TOKEN_B = 'BBBBBBBBBB2';
const TOKEN_C = 'CCCCCCCCCC3';
const TOKEN_STALE = 'SSSSSSSSSS4';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function createResponse(status, payload, headers = {}) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return {
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        const match = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
        return match ? headers[match] : null;
      },
    },
    async text() {
      return text;
    },
    clone() {
      return createResponse(status, text, headers);
    },
  };
}

function loadUserscript({ storage = createStorage(), scripts = [], state, html = '', fetchImpl } = {}) {
  const attributes = new Map();
  const document = {
    readyState: 'loading',
    body: null,
    documentElement: {
      innerHTML: html,
      appendChild() {},
      getAttribute(name) {
        return attributes.get(name) || null;
      },
      setAttribute(name, value) {
        attributes.set(name, String(value));
      },
      removeAttribute(name) {
        attributes.delete(name);
      },
    },
    addEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      return selector === 'script:not([src])'
        ? scripts.map((textContent) => ({ textContent }))
        : [];
    },
    createElement() {
      return {
        remove() {},
        setAttribute() {},
        textContent: '',
      };
    },
  };

  const exposure = `
    pageWindow.__AMEX_DASH_TEST__ = {
      amexApiFetch,
      clearAccountCache,
      discoverRelatedAccountTokens,
      extractTokensFromDOM,
      fetchCardDetailsForTokens,
      getCardDetails,
      isTokenAuthorizationError,
      getState: function () {
        return {
          cards: interceptedCardDetails.slice(),
          tokens: interceptedTokens.slice(),
        };
      },
    };
  })();`;
  const instrumented = SOURCE.replace(/\}\)\(\);\s*$/, exposure);
  assert.notEqual(instrumented, SOURCE, 'userscript test instrumentation was inserted');

  const silentConsole = {
    debug() {},
    error() {},
    log() {},
    warn() {},
  };
  const sandbox = {
    __INITIAL_STATE__: state,
    clearInterval() {},
    clearTimeout() {},
    console: silentConsole,
    document,
    fetch: fetchImpl || (async () => createResponse(200, {})),
    localStorage: storage,
    location: { pathname: '/overview' },
    setInterval() { return 1; },
    setTimeout(callback) {
      callback();
      return 1;
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.runInNewContext(instrumented, sandbox, { filename: SOURCE_PATH });
  return { hooks: sandbox.__AMEX_DASH_TEST__, storage };
}

test('DOM discovery merges inline, bootstrap-state, and HTML tokens', () => {
  const { hooks } = loadUserscript({
    scripts: [JSON.stringify({ accountToken: TOKEN_A })],
    state: { accountTokens: [TOKEN_B] },
    html: `<script>${JSON.stringify({ accountToken: TOKEN_C })}</script>`,
  });

  assert.deepEqual([...hooks.extractTokensFromDOM()], [TOKEN_A, TOKEN_B, TOKEN_C]);
});

test('a one-card cache expands through loyalty-account relationships', async () => {
  const storage = createStorage({
    amexDash_tokens: JSON.stringify([TOKEN_A]),
    amexDash_cardDetails: JSON.stringify([{ accountToken: TOKEN_A, cardName: 'platinum' }]),
    amexDash_cardsFetchedTokens: JSON.stringify([TOKEN_A]),
  });
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.endsWith('/ReadLoyaltyAccounts.v1')) {
      return createResponse(200, [{
        accountToken: TOKEN_A,
        relationships: [{ accountToken: TOKEN_B }],
      }]);
    }
    if (url.endsWith('/ReadLoyaltyBenefitsCardProduct.v1')) {
      return createResponse(200, {
        cardDetails: body.accountTokens.map((accountToken, index) => ({
          accountToken,
          cardName: index === 0 ? 'platinum' : 'business-platinum',
        })),
      });
    }
    throw new Error(`Unexpected endpoint: ${url}`);
  };
  const { hooks } = loadUserscript({
    storage,
    scripts: [JSON.stringify({ accountToken: TOKEN_A })],
    fetchImpl,
  });

  const cards = await hooks.getCardDetails();

  assert.equal(cards.length, 2);
  assert.deepEqual(JSON.parse(storage.getItem('amexDash_tokens')), [TOKEN_A, TOKEN_B]);
  assert.deepEqual(JSON.parse(storage.getItem('amexDash_cardsFetchedTokens')), [TOKEN_A, TOKEN_B]);
});

test('card lookup drops a stale token after a rejected bulk request', async () => {
  const fetchImpl = async (url, options) => {
    assert.match(url, /ReadLoyaltyBenefitsCardProduct/);
    const tokens = JSON.parse(options.body).accountTokens;
    if (tokens.length > 1 || tokens[0] === TOKEN_STALE) {
      return createResponse(403, {
        error: 'access_denied',
        message: 'Provided tokens not authorized',
      });
    }
    return createResponse(200, {
      cardDetails: [{ accountToken: TOKEN_A, cardName: 'platinum' }],
    });
  };
  const { hooks } = loadUserscript({ fetchImpl });

  const result = await hooks.fetchCardDetailsForTokens([TOKEN_A, TOKEN_STALE]);

  assert.deepEqual([...result.validTokens], [TOKEN_A]);
  assert.equal(result.cardDetails.length, 1);
  assert.equal(result.cardDetails[0].accountToken, TOKEN_A);
});

test('account cache reset preserves self-tracked history', () => {
  const history = JSON.stringify({ benefit: { 2026: 50 } });
  const storage = createStorage({
    amexDash_tokens: JSON.stringify([TOKEN_A]),
    amexDash_cardDetails: JSON.stringify([{ accountToken: TOKEN_A }]),
    amexDash_cardsFetchedTokens: JSON.stringify([TOKEN_A]),
    amexDash_history: history,
  });
  const { hooks } = loadUserscript({ storage });

  hooks.clearAccountCache();

  assert.equal(storage.getItem('amexDash_tokens'), null);
  assert.equal(storage.getItem('amexDash_cardDetails'), null);
  assert.equal(storage.getItem('amexDash_cardsFetchedTokens'), null);
  assert.equal(storage.getItem('amexDash_history'), history);
  assert.deepEqual([...hooks.getState().tokens], []);
});

test('API client honors a 429 retry before returning data', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return calls === 1
      ? createResponse(429, { error: 'rate_limited' }, { 'Retry-After': '1' })
      : createResponse(200, { ok: true });
  };
  const { hooks } = loadUserscript({ fetchImpl });

  const result = await hooks.amexApiFetch('/Test.v1', {});

  assert.equal(calls, 2);
  assert.equal(result.ok, true);
});

test('a genuine auth failure is not classified as one stale token', async () => {
  const { hooks } = loadUserscript({
    fetchImpl: async () => createResponse(401, { error: 'session_expired' }),
  });

  await assert.rejects(
    hooks.amexApiFetch('/Test.v1', {}),
    (error) => error.name === 'SessionExpiredError' && !hooks.isTokenAuthorizationError(error)
  );
});
