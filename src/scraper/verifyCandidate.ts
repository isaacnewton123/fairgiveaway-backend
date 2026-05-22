import type { Browser, HTTPResponse } from 'puppeteer-core';
import { VerificationConfig, VerificationResult, XGraphQLUserData } from './types';
import { randomDelay } from './utils';
import { launchBrowser, setCookiesAndHeaders, blockHeavyAssets } from './browser';

// eslint-disable-next-line ai-guardrails/max-function-lines
export async function verifyCandidate(
  username: string,
  tweetId: string,
  config: VerificationConfig
): Promise<VerificationResult> {
  const authToken = process.env.X_AUTH_TOKEN || '';
  const ct0 = process.env.X_CT0 || '';
  
  let browser: Browser | null = null;
  
  const result: VerificationResult = {
    avatarUrl: `https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png`,
    passedPfp: true,
    passedBio: true,
    passedAge: true,
    passedActivity: true,
    passedComment: true,
  };

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await setCookiesAndHeaders(page, authToken, ct0);
    await blockHeavyAssets(page);

    let userData: XGraphQLUserData | null = null;

    // 1. Intercept UserByScreenName GraphQL request for Anti-Bot checks
    page.on('response', async (response: HTTPResponse) => {
      const url = response.url();
      if (url.includes('/UserByScreenName') || url.includes('/UserByRestId')) {
        try {
          const json = await response.json();
          const legacy = json?.data?.user?.result?.legacy;
          if (legacy) {
            userData = legacy as XGraphQLUserData;
          }
        } catch {}
      }
    });

    // Go to profile to trigger UserByScreenName
    await page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded' });
    
    // Wait up to 3 seconds for GraphQL to resolve
    for (let i = 0; i < 15; i++) {
      if (userData) break;
      await randomDelay(200, 200);
    }

    const u = userData as XGraphQLUserData | null;
    if (u) {
      if (typeof u.profile_image_url_https === 'string') {
        result.avatarUrl = u.profile_image_url_https.replace('_normal', '');
      }

      if (config.mustPfp) {
        const hasCustomPfp = !u.default_profile_image;
        const hasBanner = !!u.profile_banner_url;
        result.passedPfp = hasCustomPfp && hasBanner;
      }

      if (config.mustBio && typeof u.description === 'string') {
        result.passedBio = !!u.description && u.description.trim().length > 0;
      }

      if (config.mustAge && typeof config.minMonths === 'number') {
        if (typeof u.created_at === 'string') {
          const createdDate = new Date(u.created_at);
          const diffTime = Math.abs(new Date().getTime() - createdDate.getTime());
          const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
          result.passedAge = diffMonths >= config.minMonths;
        } else {
          result.passedAge = false;
        }
      }

      if (config.mustActivity && typeof config.minPosts === 'number') {
        const statusesCount = typeof u.statuses_count === 'number' ? u.statuses_count : 0;
        result.passedActivity = statusesCount >= config.minPosts;
      }
    } else {
      // If we couldn't load the profile via GraphQL, they fail everything
      if (config.mustPfp) result.passedPfp = false;
      if (config.mustBio) result.passedBio = false;
      if (config.mustAge) result.passedAge = false;
      if (config.mustActivity) result.passedActivity = false;
    }

    // Fallback: If avatarUrl is still the default grey,
    // try extracting from DOM (meta tags or img tags)
    if (result.avatarUrl.includes('default_profile_400x400.png')) {
      try {
        const domAvatar = await page.evaluate((uname) => {
          // 1. Check SSR meta tags
          const meta = document.querySelector('meta[property="og:image"]');
          if (meta && meta.getAttribute('content')) {
            const content = meta.getAttribute('content');
            if (content && content.includes('pbs.twimg.com') && !content.includes('default_profile')) return content;
          }
          // 2. Check rendered img tags (avoiding the bot's default avatar
          // in the sidebar)
          const img = document.querySelector(`a[href="/${uname}"] img[src*="profile_images"]`) || 
                      document.querySelector('img[src*="profile_images"]:not([src*="default_profile"])');
          if (img) return img.getAttribute('src');
          return null;
        }, username);
        if (domAvatar) {
          result.avatarUrl = domAvatar.replace('_normal', '');
        }
      } catch {
        console.error("[scraper] Fallback avatar extraction failed");
      }
    }

    // 2. Check Comment using Search API
    if (config.mustComment) {
      const searchUrl = `https://x.com/search?q=from%3A${username}%20conversation_id%3A${tweetId}&f=live`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      
      try {
        await page.waitForSelector('article[data-testid="tweet"], div[data-testid="emptyState"]', { timeout: 8000 });
        const hasTweet = await page.evaluate(() => {
          return !!document.querySelector('article[data-testid="tweet"]');
        });
        result.passedComment = hasTweet;
      } catch {
        // Timeout means X didn't load properly,
        // we conservatively fail them to be safe
        result.passedComment = false;
      }
    }

  } catch (error) {
    console.error(`[scraper] Failed to verify ${username}:`, error);
  } finally {
    if (browser) await browser.close();
  }

  return result;
}
