import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("https://x.com/elonmusk", { waitUntil: 'domcontentloaded' });
  const ogImage = await page.evaluate(() => {
    const meta = document.querySelector('meta[property="og:image"]');
    return meta ? meta.getAttribute('content') : null;
  });
  console.log("OG Image:", ogImage);
  await browser.close();
})();
