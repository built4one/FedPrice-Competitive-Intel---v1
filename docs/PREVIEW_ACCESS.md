# Private preview access

The owner requested removing the app's extra password screen on 2026-10-04 to begin testing immediately. The configured preview alias opens directly in the `boss` workspace after Vercel grants access.

This applies only when `VERCEL=1`, `VERCEL_ENV=preview`, and the request host exactly matches the branch-scoped `STUDIO_PREVIEW_OWNER_HOST` variable (a `.vercel.app` alias). Production, local servers, custom domains, and other aliases retain the ordinary account login. The UI hides the app's sign-out button in this mode because Vercel controls access.

Vercel deployment protection remains enabled (`all_except_custom_domains`). **Do not disable that protection while owner-preview access is active.** Everyone who can access this protected alias uses the same owner test workspace. This is a temporary owner preview, not multi-user executive access.

To restore the extra app login, remove `STUDIO_PREVIEW_OWNER_HOST` from this preview branch and redeploy. Existing password accounts and production settings are unchanged. No credentials are committed to the repository.
