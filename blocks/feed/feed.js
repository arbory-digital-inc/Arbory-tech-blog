import {
  buildBlock, createOptimizedPicture, decorateBlock,
  getFormattedDate, getMetadata, loadBlock, readBlockConfig,
} from '../../scripts/lib-franklin.js';
import { queryIndex, getLanguage, fetchTagsOrCategories } from '../../scripts/scripts.js';

// Result parsers parse the query results into a format that can be used by the block builder for
// the specific block types
const resultParsers = {
  // Parse results into a cards block
  cards: async (results, blockCfg, variation = '') => {
    const blockContents = [];

    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      const fields = blockCfg.fields.split(',');
      const row = [];
      let cardImage;
      const cardBody = document.createElement('div');

      for (let innerIndex = 0; innerIndex < fields.length; innerIndex += 1) {
        const field = fields[innerIndex];
        const fieldName = field.trim().toLowerCase();

        switch (fieldName) {
          case 'image':
            cardImage = createOptimizedPicture(result[fieldName], '', variation === 'hero-block');
            break;
          case 'category': {
            // Field name category handling
            if (result[fieldName] !== '0') {
              const anchor = document.createElement('a');
              anchor.classList.add('category');
              // eslint-disable-next-line no-await-in-loop
              const categories = await fetchTagsOrCategories([result[fieldName]], 'categories', '', getLanguage());
              anchor.textContent = categories[0].name;
              cardBody.appendChild(anchor);
            }
            break;
          }
          case 'publisheddate': {
            const div = document.createElement('div');
            div.classList.add('date');
            div.textContent = getFormattedDate(new Date(parseInt(result[fieldName], 10)));
            cardBody.appendChild(div);
            break;
          }
          case 'title': {
            const div = document.createElement('div');
            div.classList.add('title');
            div.textContent = result[fieldName];
            cardBody.appendChild(div);
            break;
          }
          default: {
            const div = document.createElement('div');
            div.textContent = result[fieldName];
            cardBody.appendChild(div);
          }
        }
      }

      if (cardImage) {
        row.push(cardImage);
      }

      if (cardBody) {
        const path = document.createElement('a');
        path.href = result.path;
        cardBody.prepend(path);
        row.push(cardBody);
      }
      blockContents.push(row);
    }

    return blockContents;
  },

  highlight: (results, blockCfg, variation = '') => {
    const blockContents = [];
    results.forEach((result) => {
      const fields = blockCfg.fields.split(',').map((field) => field.trim().toLowerCase());
      const row = [];
      let cardImage;
      const cardBody = fields.includes('path') ? document.createElement('a') : document.createElement('div');
      fields.forEach((field) => {
        const fieldName = field.trim().toLowerCase();
        if (fieldName === 'path') {
          cardBody.href = result[fieldName];
        } else if (fieldName === 'image') {
          cardImage = createOptimizedPicture(result[fieldName], '', variation === 'hero-block');
        } else {
          const div = document.createElement('div');
          if (fieldName === 'publisheddate') {
            div.classList.add('date');
            div.textContent = getFormattedDate(new Date(parseInt(result[fieldName], 10)));
          } else if (fieldName === 'title') {
            div.classList.add('title');
            div.textContent = result[fieldName];
          } else {
            div.textContent = result[fieldName];
          }
          cardBody.appendChild(div);
        }
      });
      if (cardImage) {
        row.push(cardImage);
      }

      if (cardBody) {
        const path = document.createElement('a');
        path.href = result.path;
        cardBody.prepend(path);
        row.push(cardBody);
      }
      blockContents.push(row);
    });
    return blockContents;
  },
};

function getMetadataNullable(key) {
  const meta = getMetadata(key);
  return meta === '' ? null : meta;
}

/**
 * Feed block decorator to build feeds based on block configuration
 */
export default async function decorate(block) {
  const blockCfg = readBlockConfig(block);
  const blockName = (blockCfg['block-type'] ?? 'cards').trim().toLowerCase();
  const blockType = (blockName.split('(')[0]).trim();
  const variation = (blockName.match(/\((.+)\)/) === null ? '' : blockName.match(/\((.+)\)/)[1]).trim();
  const queryObj = await queryIndex(`${getLanguage()}-search`);
  const sortCriteria = blockCfg.sort ? blockCfg.sort.trim().toLowerCase() : 'path';

  // Get the query string, which includes the leading "?" character
  const queryString = window.location.search;

  // Parse the query string into an object
  const queryParams = new URLSearchParams(queryString);

  const type = (blockCfg.type ?? getMetadataNullable('type') ?? queryParams.get('feed-type'))?.trim().toLowerCase();
  const category = (blockCfg.category ?? getMetadataNullable('category' ?? queryParams.get('feed-category')))?.trim().toLowerCase();
  const tags = (blockCfg.tags ?? getMetadataNullable('tags') ?? queryParams.get('feed-tags'))?.trim().toLowerCase();
  const omitPageTypes = (blockCfg['omit-page-types'] ?? getMetadataNullable('omit-page-types')
    ?? queryParams.get('feed-omit-page-types'))?.trim().toLowerCase();
  // eslint-disable-next-line prefer-arrow-callback
  const results = queryObj.where(function filterElements(el) {
    const elType = (el.type ?? '').trim().toLowerCase();
    const elCategory = (el.category ?? '').trim().toLowerCase();
    const elFeatured = (el.featured ?? '').trim().toLowerCase();
    const elPageType = (el.pagetype ?? '').trim().toLowerCase();
    let match = false;
    match = (!type || type === elType)
      && (!category || category === elCategory)
      && (!omitPageTypes || !(omitPageTypes.split(',').includes(elPageType)))
      && (!blockCfg.featured || elFeatured === blockCfg.featured.trim().toLowerCase());
    if (match && tags) {
      const tagList = tags.split(',');
      const elTags = JSON.parse(el.tags ?? '').map((tag) => tag.trim().toLowerCase());
      match = tagList.some((tag) => elTags.includes(tag.trim()));
    }
    return match;
  }) // eslint-disable-next-line max-len
    .orderByDescending((el) => (Number.isNaN(el[sortCriteria]) ? el[sortCriteria] : parseInt(el[sortCriteria], 10)))
    .take(blockCfg.count ? parseInt(blockCfg.count, 10) : 4)
    .toList();
  block.innerHTML = '';
  const blockContents = await resultParsers[blockType](results, blockCfg, variation);
  const builtBlock = buildBlock(blockType, blockContents);

  [...block.classList].forEach((item) => {
    if (item !== 'feed') {
      builtBlock.classList.add(item);
    }
  });

  if (variation) {
    builtBlock.classList.add(variation);
  }

  if (block.parentNode) {
    block.parentNode.replaceChild(builtBlock, block);
  }

  decorateBlock(builtBlock);
  await loadBlock(builtBlock);
  return builtBlock;
}
