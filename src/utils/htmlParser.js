import * as cheerio from "cheerio";

export function transformHostedHtml(html, baseHref = "./") {
  const $ = cheerio.load(html);

  // 1. Inject <base> tag if it doesn't exist
  if ($("base").length === 0) {
    if ($("head").length === 0) {
      // If there's absolutely no head, prepend one to html body.
      // cheerio guarantees an html structure on load.
      $("html").prepend("<head></head>");
    }
    $("head").prepend(`<base href="${baseHref}">`);
  }

  // 2. Rewrite root-absolute asset paths (e.g. src="/assets/img.png" -> src="./assets/img.png")
  // This forces them to respect the baseHref instead of hitting the literal server root.
  const assetTags = ["script", "img", "source", "video", "audio", "iframe"];

  assetTags.forEach((tag) => {
    $(tag).each((_, el) => {
      const src = $(el).attr("src");
      if (src && src.startsWith("/") && !src.startsWith("//")) {
        $(el).attr("src", "." + src);
      }
    });
  });

  // 3. Handle <link> tags separately (stylesheets, preloaders, icons)
  $("link").each((_, el) => {
    const href = $(el).attr("href");
    const rel = $(el).attr("rel") || "";
    if (href && href.startsWith("/") && !href.startsWith("//")) {
      const shouldRewrite = /stylesheet|icon|preload|modulepreload/i.test(rel);
      if (shouldRewrite) {
        $(el).attr("href", "." + href);
      }
    }
  });

  return $.html();
}
