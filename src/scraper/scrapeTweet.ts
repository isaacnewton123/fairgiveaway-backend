import type { Browser, HTTPResponse } from 'puppeteer-core';
import { ScrapeResult } from './types';
import { extractScreenNames, buildApiFilter, buildTabPath } from './utils';
import { launchBrowser, setCookiesAndHeaders, blockHeavyAssets, scrollToCollect } from './browser';

/**
 * Scrapes participant usernames from a tweet's likes or reposts tab
 * by intercepting X's GraphQL API responses.
 */
// eslint-disable-next-line ai-guardrails/max-function-lines
export async function scrapeTweet(
  tweetId: string,
  mode: 'likes' | 'reposts'
): Promise<ScrapeResult> {
  const authToken = process.env.X_AUTH_TOKEN || '';
  const ct0 = process.env.X_CT0 || '';
  const usernames = new Set<string>();
  const apiFilter = buildApiFilter(mode);

  let browser: Browser | null = null;
  let hostUsername = 'unknown';
  let hostAvatarUrl: string | undefined = undefined;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await setCookiesAndHeaders(page, authToken, ct0);
    await blockHeavyAssets(page);

    // Intercept GraphQL responses to extract screen_names
    page.on('response', async (response: HTTPResponse) => {
      const url = response.url();
      if (!url.includes(apiFilter)) return;

      try {
        const json = await response.json();
        const names = extractScreenNames(json);
        for (const name of names) usernames.add(name);
      } catch {
        // Non-JSON or failed parse — safe to ignore
      }
    });

    // Navigate directly to the tab using the /i/status shortcut
    const tabUrl = `https://x.com/i/status/${tweetId}${buildTabPath(mode)}`;
    await page.goto(tabUrl, { waitUntil: 'domcontentloaded' });
    
    try {
      await page.waitForSelector('main', { timeout: 10000 });
    } catch {
      console.log("[scraper] Main container is slow to appear, continue executing...");
    }

    // Now that React has mounted, the SPA should have redirected
    // /i/ to /username/
    const resolvedUrl = page.url();
    try {
      const pathParts = new URL(resolvedUrl).pathname.split('/');
      if (pathParts.length > 1 && pathParts[1] !== 'i') {
        hostUsername = pathParts[1];
      }
    } catch {}

    if (hostUsername !== 'unknown') {
      try {
        const domAvatar = await page.evaluate((uname) => {
          const img = document.querySelector(`a[href="/${uname}"] img[src*="profile_images"]`) ||
                      document.querySelector('img[src*="profile_images"]:not([src*="default_profile"])');
          if (img) return img.getAttribute('src');
          return null;
        }, hostUsername);
        if (domAvatar) {
          hostAvatarUrl = domAvatar.replace('_normal', '');
        }
      } catch {}
    }

    await scrollToCollect(page);

    return { participants: Array.from(usernames), hostUsername, hostAvatarUrl };
  } catch (error) {
    console.error(`[scraper] Failed to scrape ${mode} for tweet ${tweetId}:`, error);
    return { participants: [], hostUsername: 'unknown' };
  } finally {
    if (browser) await browser.close();
  }
}
