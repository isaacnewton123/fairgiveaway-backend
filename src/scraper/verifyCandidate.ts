import type { Browser, Page, HTTPResponse } from "puppeteer-core";
import {
  VerificationConfig,
  VerificationResult,
  XGraphQLUserData,
} from "./types";
import { randomDelay } from "./utils";
import {
  launchBrowser,
  setCookiesAndHeaders,
  blockHeavyAssets,
} from "./browser";

function applyGraphQLData(
  u: XGraphQLUserData,
  config: VerificationConfig,
  result: VerificationResult,
): void {
  console.log("[scraper] Applying GraphQL Data:", JSON.stringify(u));
  if (typeof u.profile_image_url_https === "string") {
    result.avatarUrl = u.profile_image_url_https.replace("_normal", "_400x400");
  }
  if (config.mustPfp) {
    result.passedPfp = !u.default_profile_image && !!u.profile_banner_url;
  }
  if (config.mustBio && typeof u.description === "string") {
    result.passedBio = !!u.description && u.description.trim().length > 0;
  }
  if (config.mustAge && typeof config.minMonths === "number") {
    if (typeof u.created_at === "string") {
      const createdDate = new Date(u.created_at);
      const now = new Date();
      const diffMonths =
        (now.getFullYear() - createdDate.getFullYear()) * 12 +
        (now.getMonth() - createdDate.getMonth());
      console.log(
        `[scraper] GraphQL Age Check: created=${u.created_at}, diff=${diffMonths}, min=${config.minMonths}`,
      );
      result.passedAge = diffMonths >= config.minMonths;
      result.actualAgeMonths = diffMonths;
    } else {
      console.log(`[scraper] GraphQL Age Check: created_at missing`);
      result.passedAge = false;
      result.actualAgeMonths = 0;
    }
  }
  if (config.mustActivity && typeof config.minPosts === "number") {
    console.log(
      `[scraper] GraphQL Post Check: posts=${u.statuses_count}, min=${config.minPosts}`,
    );
    result.passedActivity = (u.statuses_count || 0) >= config.minPosts;
    result.actualPosts = u.statuses_count || 0;
  }
}

interface DOMData {
  bio: string;
  hasCustomPfp: boolean;
  hasBanner: boolean;
  joinDateText: string;
  posts: number;
}

async function getDOMData(page: Page): Promise<DOMData> {
  return await page.evaluate(() => {
    const bio =
      document.querySelector('div[data-testid="UserDescription"]')
        ?.textContent || "";
    const hasCustomPfp = !!document.querySelector(
      'a[href$="/photo"] img[src*="profile_images"]:not([src*="default_profile"])',
    );
    const hasBanner = !!document.querySelector('a[href$="/header_photo"] img');
    const joinDateSpan = Array.from(document.querySelectorAll("span")).find(
      (s) =>
        /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i.test(
          s.textContent || "",
        ),
    );
    const joinDateText =
      joinDateSpan?.textContent?.match(
        /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i,
      )?.[0] || "";
    const headerDivs = Array.from(document.querySelectorAll('div[dir="ltr"]'));
    let posts = 0;
    for (const div of headerDivs) {
      const text = div.textContent || "";
      if (text.includes("post") || text.includes("Post")) {
        const numMatch = text.replace(/,/g, "").match(/([\d\.]+)([KkMm]?)/);
        if (numMatch) {
          let val = parseFloat(numMatch[1]);
          if (numMatch[2].toLowerCase() === "k") val *= 1000;
          if (numMatch[2].toLowerCase() === "m") val *= 1000000;
          posts = val;
          break;
        }
      }
    }
    return { bio, hasCustomPfp, hasBanner, joinDateText, posts };
  });
}

async function applyDOMFallback(
  page: Page,
  config: VerificationConfig,
  result: VerificationResult,
): Promise<void> {
  console.log("[scraper] Applying DOM Fallback");
  try {
    const dom = await getDOMData(page);

    console.log("[scraper] DOM Data:", JSON.stringify(dom));

    if (config.mustPfp && !result.passedPfp)
      result.passedPfp = dom.hasCustomPfp && dom.hasBanner;
    if (config.mustBio && !result.passedBio)
      result.passedBio = dom.bio.trim().length > 0;
    if (
      config.mustAge &&
      !result.passedAge &&
      typeof config.minMonths === "number"
    ) {
      if (dom.joinDateText) {
        const createdDate = new Date(dom.joinDateText);
        if (!isNaN(createdDate.getTime())) {
          const now = new Date();
          const diffMonths =
            (now.getFullYear() - createdDate.getFullYear()) * 12 +
            (now.getMonth() - createdDate.getMonth());
          console.log(
            `[scraper] DOM Age Check: parsed=${dom.joinDateText}, diff=${diffMonths}, min=${config.minMonths}`,
          );
          result.passedAge = diffMonths >= config.minMonths;
          result.actualAgeMonths = diffMonths;
        } else {
          console.log(`[scraper] DOM Age Check: failed to parse date`);
          result.actualAgeMonths = 0;
        }
      } else {
        console.log(`[scraper] DOM Age Check: joinDateText empty`);
      }
    }
    if (
      config.mustActivity &&
      !result.passedActivity &&
      typeof config.minPosts === "number"
    ) {
      result.passedActivity = dom.posts >= config.minPosts;
      result.actualPosts = dom.posts;
    }
  } catch (err) {
    console.error("[scraper] DOM Fallback failed", err);
  }
}

async function extractAvatarFallback(
  page: Page,
  username: string,
  result: VerificationResult,
): Promise<void> {
  if (!result.avatarUrl.includes("default_profile_400x400.png")) return;
  try {
    const domAvatar = await page.evaluate((uname) => {
      const meta = document.querySelector('meta[property="og:image"]');
      if (meta && meta.getAttribute("content")) {
        const content = meta.getAttribute("content");
        if (
          content &&
          content.includes("pbs.twimg.com") &&
          !content.includes("default_profile")
        )
          return content;
      }
      const img =
        document.querySelector(
          `a[href$="/photo"] img[src*="profile_images"]`,
        ) ||
        document.querySelector(
          `a[href="/${uname}" i] img[src*="profile_images"]`,
        ) ||
        document.querySelector(
          'img[src*="profile_images"]:not([src*="default_profile"])',
        );
      return img ? img.getAttribute("src") : null;
    }, username);
    if (domAvatar) result.avatarUrl = domAvatar.replace("_normal", "_400x400");
  } catch {}
}

async function checkComment(
  page: Page,
  username: string,
  tweetId: string,
  result: VerificationResult,
): Promise<void> {
  const searchUrl = `https://x.com/search?q=from%3A${username}%20conversation_id%3A${tweetId}&f=live`;
  await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForSelector(
      'article[data-testid="tweet"], div[data-testid="emptyState"]',
      { timeout: 8000 },
    );
    result.passedComment = await page.evaluate(
      () => !!document.querySelector('article[data-testid="tweet"]'),
    );
  } catch {
    result.passedComment = false;
  }
}

export async function verifyCandidate(
  username: string,
  tweetId: string,
  config: VerificationConfig,
): Promise<VerificationResult> {
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
    const { browser: b, page } = await setupVerificationPage();
    browser = b;

    const userData = await loadProfileWithGraphQL(page, username);

    let needsDOM = !userData;

    const u = userData as XGraphQLUserData | null;
    if (u) {
      applyGraphQLData(u, config, result);
      if (config.mustAge && !u.created_at) needsDOM = true;
    }

    if (needsDOM) {
      console.log(
        `[scraper] Triggering DOM Fallback (userData missing or incomplete)`,
      );
      await applyDOMFallback(page, config, result);
    }

    await extractAvatarFallback(page, username, result);

    if (config.mustComment) {
      await checkComment(page, username, tweetId, result);
    }

    console.log(`[scraper] Final Result for ${username}:`, result);
  } catch (error) {
    console.error(`[scraper] Failed to verify ${username}:`, error);
  } finally {
    if (browser) await browser.close();
  }
  return result;
}

function setupGraphQLListener(
  page: Page,
  callback: (data: XGraphQLUserData) => void,
): void {
  page.on("response", async (response: HTTPResponse) => {
    const url = response.url();
    if (url.includes("/UserByScreenName") || url.includes("/UserByRestId")) {
      try {
        const legacy = (await response.json())?.data?.user?.result?.legacy;
        if (legacy) callback(legacy as XGraphQLUserData);
      } catch {}
    }
  });
}

async function waitForProfile(page: Page, username: string): Promise<void> {
  await page.goto(`https://x.com/${username}`, {
    waitUntil: "domcontentloaded",
  });
  try {
    await page.waitForSelector('div[data-testid="UserName"]', {
      timeout: 8000,
    });
    await page
      .waitForSelector('div[data-testid="UserProfileHeader_Items"]', {
        timeout: 4000,
      })
      .catch(() => {});
} catch {}
}

async function setupVerificationPage(): Promise<{ browser: Browser, page: Page }> {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await setCookiesAndHeaders(
    page,
    process.env.X_AUTH_TOKEN || "",
    process.env.X_CT0 || "",
  );
  await blockHeavyAssets(page);
  return { browser, page };
}

async function loadProfileWithGraphQL(page: Page, username: string): Promise<XGraphQLUserData | null> {
  let userData: XGraphQLUserData | null = null;
  setupGraphQLListener(page, (data) => { userData = data; });
  await waitForProfile(page, username);
  for (let i = 0; i < 30; i++) {
    if (userData) break;
    await randomDelay(200, 200);
  }
  return userData;
}
