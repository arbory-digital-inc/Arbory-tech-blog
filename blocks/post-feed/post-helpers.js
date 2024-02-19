import * as taxonomyLibrary from '../../scripts/taxonomy.js';
import { getMetadata } from '../../utils/utils.js';

let taxonomyModule;

export function stamp(message) {
  if (window.name.includes('performance')) {
    // eslint-disable-next-line no-console
    console.warn(`${new Date() - performance.timeOrigin}:${message}`);
  }
}

/**
 * number case, coming from Excel
 * 1/1/1900 is day 1 in Excel, so:
 *  - add this
 *  - add days between 1/1/1900 and 1/1/1970
 *  - add one more day for Excel's leap year bug
 *
 * @param {number} date The date to format
 * @returns {string} The formatted date
 */
function calculateExcelDate(date) {
  return new Date(Math.round((date - (1 + 25567 + 1)) * 86400 * 1000));
}

/**
 * Format date to locale.
 *
 * @param {number} date The date to format
 * @returns {string} The formatted card date
 */
export function formatCardLocaleDate(date, dateLocale = 'en-US') {
  if (!date) return '';
  const jsDate = !date.includes('-') ? calculateExcelDate(date) : date.replace(/-/g, '/');

  let dateString = new Date(jsDate).toLocaleDateString(dateLocale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });

  if (dateLocale === 'en-US') {
    // stylize US date format with dashes instead of slashes
    dateString = dateString.replace(/\//g, '-');
  }
  return dateString;
}

/**
 * For the given list of topics, returns the corresponding computed taxonomy:
 * - category: main topic
 * - topics: tags as an array
 * - visibleTopics: list of visible topics, including parents
 * - allTopics: list of all topics, including parents
 * @param {Array} topics List of topics
 * @returns {Object} Taxonomy object
 */
function computeTaxonomyFromTopics(topics, path) {
  // no topics: default to a randomly choosen category
  const category = topics?.length > 0 ? topics[0] : 'posts';
  if (taxonomyModule) {
    const allTopics = [];
    const visibleTopics = [];
    // if taxonomy loaded, we can compute more
    topics?.forEach((tag) => {
      const tax = taxonomyModule.get(tag);
      if (tax) {
        if (!allTopics.includes(tag) && !tax.skipMeta) {
          allTopics.push(tag);
          if (tax.isUFT) visibleTopics.push(tag);
          const parents = taxonomyModule.getParents(tag);
          if (parents) {
            parents.forEach((parent) => {
              const ptax = taxonomyModule.get(parent);
              if (!allTopics.includes(parent)) {
                allTopics.push(parent);
                if (ptax.isUFT) visibleTopics.push(parent);
              }
            });
          }
        }
      } else {
        // eslint-disable-next-line no-console
        console.warn(`Unknown topic in tags list: ${tag} ${path ? `on page ${path}` : '(current page)'}`);
      }
    });
    return {
      category,
      topics,
      visibleTopics,
      allTopics,
    };
  }
  return { category, topics };
}

/**
 * Loads (i.e. sets on object) the taxonomy properties for the given post.
 * @param {Object} post The post to enhance with the taxonomy data
 */
export function loadPostTaxonomy(post) {
  const clonedPost = { ...post };

  if (clonedPost.allTopics) {
    return clonedPost;
  }

  // for now, we can only compute the category
  const { tags, path } = clonedPost;

  if (tags) {
    const topics = tags
      .replace(/[["\]]/gm, '')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t && t !== '');

    const postTax = computeTaxonomyFromTopics(topics, path);

    clonedPost.category = postTax.category;

    // topics = tags as an array
    clonedPost.topics = topics;

    // visibleTopics = visible topics including parents
    clonedPost.visibleTopics = postTax.allVisibleTopics;

    // allTopics = all topics including parents
    clonedPost.allTopics = postTax.allTopics;
  } else {
    clonedPost.category = 'Posts';
    clonedPost.topics = [];
    clonedPost.visibleTopics = [];
    clonedPost.allTopics = [];
  }

  return clonedPost;
}

export function getTaxonomyModule() {
  return taxonomyModule;
}

/**
 * Prefixes the link with the language root defined in the metadata
 * @param link
 * @returns {string|*}
 */
// eslint-disable-next-line import/prefer-default-export
export function updateLinkWithLangRoot(link) {
  const langRoot = getMetadata('lang-root');
  if (!langRoot) return link;
  try {
    const url = new URL(link);
    url.pathname = `${langRoot}${url.pathname}`;
    return url.href;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Could not update link with lang root', e);
    return link;
  }
}

/**
 * Returns a link tag with the proper href for the given topic.
 * If the taxonomy is not yet available, the tag is decorated with the topicLink
 * data attribute so that the link can be fixed later.
 * @param {string} topic The topic name
 * @returns {string} A link tag as a string
 */
function getLinkForTopic(topic, path) {
  const catLink = updateLinkWithLangRoot([getTaxonomyModule()?.get(topic)].map((tax) => tax?.link ?? '#'));

  if (catLink === '#') {
    // eslint-disable-next-line no-console
    console.warn(`Trying to get a link for an unknown topic: ${topic} ${path ? `on page ${path}` : '(current page)'}`);
  }

  return `<a href="${catLink ?? ''}" ${!catLink ? `data-topic-link="${topic}"` : ''}>${topic}</a>`;
}

export async function loadTaxonomy() {
  // const config = getConfig();
  const taxonomyRoot = '/posts';
  taxonomyModule = await taxonomyLibrary.default(taxonomyRoot, '/taxonomy.json');
  if (taxonomyModule) {
    // taxonomy loaded, post loading adjustments
    // fix the links which have been created before the taxonomy has been loaded
    // (pre lcp or in lcp block).
    document.querySelectorAll('[data-topic-link]').forEach((a) => {
      const topic = a.dataset.topicLink;
      const tax = taxonomyModule.get(topic);
      if (tax) {
        a.href = tax.link;
      } else {
        // eslint-disable-next-line no-console
        window.lana.log(`Trying to get a link for an unknown topic: ${topic} (current page)`);
        a.href = '#';
      }
      delete a.dataset.topicLink;
    });

    const currentTags = [...document.head.querySelectorAll('meta[property="post:tag"]')].map((el) => el.content) || [];
    const postTax = computeTaxonomyFromTopics(currentTags);

    const allTopics = postTax.allTopics || [];
    allTopics.forEach((topic) => {
      if (!currentTags.includes(topic)) {
        // computed topic (parent...) is not in meta -> add it
        const newMetaTag = document.createElement('meta');
        newMetaTag.setAttribute('property', 'post:tag');
        newMetaTag.setAttribute('content', topic);
        document.head.append(newMetaTag);
      }
    });

    currentTags.forEach((tag) => {
      const tax = taxonomyModule.get(tag);
      if (tax && tax.skipMeta) {
        // if skipMeta, remove from meta "post:tag"
        const meta = document.querySelector(`[property="post:tag"][content="${tag}"]`);
        if (meta) {
          meta.remove();
        }
        // but add as meta with name
        const newMetaTag = document.createElement('meta');
        newMetaTag.setAttribute('name', tag);
        newMetaTag.setAttribute('content', 'true');
        document.head.append(newMetaTag);
      }
    });
  }
}

/**
 * Get the taxonomy of the given post. Object can be composed of:
 * - category: main topic
 * - topics: tags as an array
 * - visibleTopics: list of visible topics, including parents
 * - allTopics: list of all topics, including parents
 * Note: to get the full object, taxonomy must be loaded
 * @param {Object} post The post
 * @returns The taxonomy object
 */
export function getPostTaxonomy(post) {
  const {
    category,
    topics,
    visibleTopics,
    allTopics,
  } = post.allTopics ? post : loadPostTaxonomy(post);

  return {
    category,
    topics,
    visibleTopics,
    allTopics,
  };
}

/**
 * Sanitizes a name for use as class name.
 * @param {*} name The unsanitized name
 * @returns {string} The class name
 */
export function toClassName(name) {
  return name && typeof name === 'string'
    ? name.toLowerCase().replace(/[^0-9a-z]/gi, '-')
    : '';
}

export function createOptimizedPicture(src, alt = '', eager = false, breakpoints = [{ media: '(min-width: 400px)', width: '2000' }, { width: '750' }]) {
  const url = new URL(src, window.location.href);
  const picture = document.createElement('picture');
  const { pathname } = url;
  const ext = pathname.substring(pathname.lastIndexOf('.') + 1);

  // webp
  breakpoints.forEach((br) => {
    const source = document.createElement('source');
    if (br.media) source.setAttribute('media', br.media);
    source.setAttribute('type', 'image/webp');
    source.setAttribute('srcset', `${pathname}?width=${br.width}&format=webply&optimize=medium`);
    picture.appendChild(source);
  });

  // fallback
  breakpoints.forEach((br, i) => {
    if (i < breakpoints.length - 1) {
      const source = document.createElement('source');
      if (br.media) source.setAttribute('media', br.media);
      source.setAttribute('srcset', `${pathname}?width=${br.width}&format=${ext}&optimize=medium`);
      picture.appendChild(source);
    } else {
      const img = document.createElement('img');
      img.setAttribute('src', `${pathname}?width=${br.width}&format=${ext}&optimize=medium`);
      img.setAttribute('loading', eager ? 'eager' : 'lazy');
      img.setAttribute('alt', alt);
      picture.appendChild(img);
    }
  });

  return picture;
}

/**
 * Build post card
 * @param {Element} post The post data to be placed in card.
 * @returns card Generated card
 */
export function buildPostCard(post, type = 'post', eager = false) {
  const {
    title,
    description,
    image,
    imageAlt,
    date,
  } = post;

  const path = post.path.split('.')[0];

  const picture = createOptimizedPicture(image, imageAlt || title, eager, [{ width: '750' }]);
  const pictureTag = picture.outerHTML;
  const card = document.createElement('a');
  card.className = `${type}-card`;
  card.href = path;

  const postTax = getPostTaxonomy(post);
  const categoryTag = getLinkForTopic(postTax.category, path);

  card.innerHTML = `<div class="${type}-card-image">
      ${pictureTag}
    </div>
    <div class="${type}-card-body">
      <p class="${type}-card-category">
        ${categoryTag}
      </p>
      <h3>${title}</h3>
      <p class="${type}-card-description">${description}</p>
      <p class="${type}-card-date">${formatCardLocaleDate(date)}
    </div>`;
  return card;
}
