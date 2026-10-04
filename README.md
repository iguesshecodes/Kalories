# Tally (Kalories)

A personal calorie tracker. Tap the camera, photograph your plate, check the list, log it.

## Go live on Vercel (about 3 minutes)
1. Put this folder in a GitHub repository, or run `npx vercel` inside it.
2. In Vercel, open the project, then Settings, Environment Variables, and add:
   - `GEMINI_API_KEY` (free, no card). Create one at aistudio.google.com, then Get API key. This is what reads your photos.
   - Optional paid alternative: `ANTHROPIC_API_KEY` from console.anthropic.com. It is only used if there is no Gemini key.
   - `ACCESS_CODE` (recommended). Any private word. Without it, anyone with your link could use your key.
3. Redeploy once so the variables apply.
4. Open your link on your phone, then Add to Home Screen. If you set an ACCESS_CODE, type the same code in Me, Photo logging.

Everything else (foods, trends, targets) works with no server and no key.

## Tests
`npm test`
