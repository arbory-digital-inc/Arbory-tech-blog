export function getMetadata(name, doc = document) {
  const attr = name && name.includes(':') ? 'property' : 'name';
  const meta = doc.head.querySelector(`meta[${attr}="${name}"]`);
  return meta && meta.content;
}

export function createIntersectionObserver({
  el,
  callback,
  once = true,
  options = {},
}) {
  const io = new IntersectionObserver((entries, observer) => {
    entries.forEach(async (entry) => {
      if (entry.isIntersecting) {
        if (once) observer.unobserve(entry.target);
        callback(entry.target, entry);
      }
    });
  }, options);
  io.observe(el);
  return io;
}

export function getConfig() {
  return {
    locale: {
      ietf: 'en-US',
      prefix: '',
      region: 'us',
    },
  };
}
