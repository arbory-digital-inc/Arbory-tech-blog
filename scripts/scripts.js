import {
  sampleRUM,
  buildBlock,
  loadHeader,
  loadFooter,
  decorateButtons,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForLCP,
  loadBlocks,
  loadCSS,
  fetchPlaceholders,
} from './lib-franklin.js';

const LCP_BLOCKS = []; // add your LCP blocks to the list

/**
 * Builds hero block and prepends to main in a new section.
 * @param {Element} main The container element
 */
function buildHeroBlock(main) {
  const h1 = main.querySelector('h1');
  const picture = main.querySelector('picture');
  // eslint-disable-next-line no-bitwise
  if (h1 && picture && (h1.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_PRECEDING)) {
    const section = document.createElement('div');
    section.append(buildBlock('hero', { elems: [picture, h1] }));
    main.prepend(section);
  }
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    buildHeroBlock(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateButtons(main);
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await waitForLCP(LCP_BLOCKS);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  const main = doc.querySelector('main');
  await loadBlocks(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadHeader(doc.querySelector('header'));
  loadFooter(doc.querySelector('footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();

  sampleRUM('lazy');
  sampleRUM.observe(main.querySelectorAll('div[data-block-name]'));
  sampleRUM.observe(main.querySelectorAll('picture > img'));
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}



export function getLanguageFromPath(pathname, resetCache = false) {
  if (resetCache) {
    language = undefined;
  }

  if (language !== undefined) return language;

  const segs = pathname.split('/');
  if (segs.length > 1) {
    const l = segs[1];
    if (LANGUAGES.has(l)) {
      language = l;
    }
  }

  if (language === undefined) {
    language = 'en'; // default to English
  }

  return language;
}

export function getLanguage(curPath = window.location.pathname, resetCache = false) {
  return getLanguageFromPath(curPath, resetCache);
}

export function getLanguangeSpecificPath(path) {
  const lang = getLanguage();
  if (lang === 'en') return path;
  return `/${lang}${path}`;
}

export async function loadScript(url, attrs = {}) {
  const script = document.createElement('script');
  script.src = url;
  // eslint-disable-next-line no-restricted-syntax
  for (const [name, value] of Object.entries(attrs)) {
    script.setAttribute(name, value);
  }
  const loadingPromise = new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
  });
  document.head.append(script);
  return loadingPromise;
}

export async function queryIndex(sheet) {
  await loadScript('/ext-libs/jslinq/jslinq.min.js');
  let index = await fetchIndex('query-index', sheet);
  // Fetch the index until it is complete
  while (!index.complete) {
    // eslint-disable-next-line no-await-in-loop
    index = await fetchIndex('query-index', sheet);
  }
  const { jslinq } = window;
  return jslinq(index.data);
}

export async function fetchTagsOrCategories(ids = [], sheet = 'tags', type = '', locale = 'en') {
  window.tagsCategories = window.tagsCategories || {};
  const sheetKey = sheet;
  const loaded = window.tagsCategories[`${sheetKey}-loaded`];

  if (!loaded) {
    const placeholders = await fetchPlaceholders(locale);
    const sheetName = sheet ? `sheet=${sheet}` : '';
    window.tagsCategories[`${sheetKey}-loaded`] = new Promise((resolve, reject) => {
      fetch(`/tags-categories.json?${sheetName}`)
        .then((resp) => {
          if (resp.ok) {
            return resp.json();
          }
          throw new Error(`${resp.status}: ${resp.statusText}`);
        })
        .then((results) => {
          // eslint-disable-next-line max-len
          window.tagsCategories[sheetKey] = results.data.map((ele) => ({ id: ele.Key, type: ele.Type, name: placeholders[ele.Key] }));
          resolve();
        }).catch((error) => {
          // Error While Loading tagsCategories
          window.tagsCategories[sheetKey] = {};
          reject(error);
        });
    });
  }

  if (!window.jslinq) {
    await loadScript('/ext-libs/jslinq/jslinq.min.js');
  }

  await window.tagsCategories[`${sheetKey}-loaded`];
  return window.tagsCategories[sheetKey]
    .filter((ele) => (!ids.length || ids.indexOf(ele.id) > -1) && (!type || ele.type === type));
}

loadPage();