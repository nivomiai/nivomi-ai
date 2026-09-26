// Exotel REST calls used by the spike.
// Endpoint per Exotel developer docs (AgentStream "Connect Voice AI" and "Connect Voice AI with
// Flow"): POST https://<host>/v1/Accounts/<AccountSid>/Calls/connect, form-encoded, HTTP Basic
// auth with API key and token.

/** @param {{ apiKey: string, apiToken: string }} exotel */
function authHeader(exotel) {
  return `Basic ${Buffer.from(`${exotel.apiKey}:${exotel.apiToken}`).toString('base64')}`;
}

/**
 * @param {{ accountSid: string, apiKey: string, apiToken: string, host: string }} exotel
 * @param {Record<string, string>} params
 */
export async function connectCall(exotel, params) {
  const url = `https://${exotel.host}/v1/Accounts/${encodeURIComponent(exotel.accountSid)}/Calls/connect`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader(exotel),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Exotel HTTP ${res.status}: ${text.slice(0, 500)}`);
  return text;
}

/**
 * Read-only credential probe: GET the account resource.
 * 200 → credentials work; 401/403 → rejected; anything else → inconclusive.
 */
export async function probeAccount(exotel) {
  const url = `https://${exotel.host}/v1/Accounts/${encodeURIComponent(exotel.accountSid)}`;
  const res = await fetch(url, { headers: { Authorization: authHeader(exotel) } });
  return res.status;
}
