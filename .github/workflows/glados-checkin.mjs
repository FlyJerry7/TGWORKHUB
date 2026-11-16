import { createHash } from "node:crypto";

const baseUrl = process.env.GLADOS_BASE_URL || "https://glados.cloud";
const cookie = process.env.GLADOS_COOKIE;

if (!cookie) {
  throw new Error("GLADOS_COOKIE is not configured");
}

const commonHeaders = {
  accept: "application/json",
  "content-type": "application/json",
  cookie,
  origin: baseUrl,
  referer: `${baseUrl}/console/checkin`,
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...commonHeaders,
      ...options.headers,
    },
  });
  const text = await response.text();

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`GLaDOS returned HTTP ${response.status}: ${text}`);
  }

  if (!response.ok) {
    throw new Error(
      `GLaDOS returned HTTP ${response.status}: ${JSON.stringify(body)}`,
    );
  }

  return body;
}

const challenge = await request("/api/user/checkin/challenge");
console.log("Challenge response:", JSON.stringify(challenge));

if (challenge.code !== 0) {
  throw new Error(
    `Could not obtain a check-in challenge: ${challenge.message || challenge.code}`,
  );
}

if (challenge.turnstile) {
  console.error(
    "GLaDOS requires an interactive Cloudflare Turnstile challenge for this runner.",
  );
  console.error(
    "A GitHub-hosted runner has no user browser, so it cannot complete this challenge reliably.",
  );
  console.error(
    "Use a trusted self-hosted runner with a real browser, or check in manually.",
  );
  process.exit(75);
}

if (!challenge.nonce) {
  throw new Error("GLaDOS did not return a check-in nonce");
}

// The web client intentionally waits at least 2.5 seconds before submitting.
await new Promise((resolve) => setTimeout(resolve, 2600));

const proof = createHash("sha256")
  .update(`${challenge.nonce}.glados-observe-v1`)
  .digest("hex");

const result = await request("/api/user/checkin", {
  method: "POST",
  body: JSON.stringify({
    token: new URL(baseUrl).hostname,
    nonce: challenge.nonce,
    proof,
    tsState: "off",
  }),
});

console.log("Check-in response:", JSON.stringify(result));

if (result.code !== 0) {
  process.exitCode = 1;
}
