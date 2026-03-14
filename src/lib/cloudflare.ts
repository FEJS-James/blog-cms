/**
 * Cloudflare Pages rebuild trigger.
 *
 * Fires a deployment for the Cloudflare Pages project that corresponds
 * to a given blog slug.  The call is intentionally fire-and-forget so
 * it never blocks or breaks the calling API route.
 */

const BLOG_SLUG_TO_PROJECT: Record<string, string> = {
  techpulse: "techpulse",
  smarthomemade: "smarthomemade",
  dailybudgetlife: "dailybudgetlife",
};

/**
 * Trigger a Cloudflare Pages deployment for the given blog slug.
 *
 * - Resolves the blog slug to a Cloudflare Pages project name.
 * - Uses `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` env vars.
 * - Never throws — logs errors and returns silently.
 */
export async function triggerCloudflareRebuild(
  blogSlug: string
): Promise<void> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    console.warn(
      "[cloudflare] Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN — skipping rebuild"
    );
    return;
  }

  const projectName = BLOG_SLUG_TO_PROJECT[blogSlug];

  if (!projectName) {
    console.warn(
      `[cloudflare] No Cloudflare Pages project mapped for blog slug "${blogSlug}" — skipping rebuild`
    );
    return;
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      console.log(
        `[cloudflare] Rebuild triggered for "${projectName}" (blog: ${blogSlug})`
      );
    } else {
      const text = await response.text();
      console.error(
        `[cloudflare] Failed to trigger rebuild for "${projectName}" — ` +
          `${response.status} ${response.statusText}: ${text}`
      );
    }
  } catch (error) {
    console.error(
      `[cloudflare] Error triggering rebuild for "${projectName}":`,
      error
    );
  }
}
