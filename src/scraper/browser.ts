import puppeteer, { Browser, Page, HTTPRequest } from 'puppeteer-core';
import { randomDelay } from './utils';

export const EXEC_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
export const MAX_SCROLLS = 50;

export async function launchBrowser(): Promise<Browser> {
  return await puppeteer.launch({
    executablePath: EXEC_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
}

export async function setCookiesAndHeaders(
  page: Page,
  authToken: string,
  ct0: string
): Promise<void> {
  await page.setCookie(
    { name: 'auth_token', value: authToken, domain: '.x.com' },
    { name: 'ct0', value: ct0, domain: '.x.com' }
  );
  await page.setExtraHTTPHeaders({ 'x-csrf-token': ct0 });
}

export async function scrollToCollect(page: Page): Promise<void> {
  for (let i = 0; i < MAX_SCROLLS; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await randomDelay(1000, 2000);
  }
}

export async function blockHeavyAssets(page: Page): Promise<void> {
  await page.setRequestInterception(true);
  page.on('request', (req: HTTPRequest) => {
    const resourceType = req.resourceType();
    if (['media', 'font', 'stylesheet'].includes(resourceType)) {
      req.abort();
    } else {
      req.continue();
    }
  });
}
