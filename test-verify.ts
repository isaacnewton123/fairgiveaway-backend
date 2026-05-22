import { verifyCandidate } from './src/scraper/verifyCandidate';

async function run() {
  const result = await verifyCandidate('elonmusk', '1', {
    mustPfp: false,
    mustBio: false,
    mustAge: false,
    mustActivity: false,
    mustComment: false,
  });
  console.log(result);
}

run();
