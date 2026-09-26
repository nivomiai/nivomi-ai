# Setting up the HubSpot connection

Nivomi connects each organization to **its own** HubSpot account through OAuth (ADR-012,
ADR-020). The Nivomi team registers **one** HubSpot app; customers then connect their accounts
from **Data sources → HubSpot → Connect HubSpot**.

Until the steps below are done, the app shows "Connecting HubSpot is not enabled on this
workspace yet". Everything else (file imports, manual leads) works without HubSpot.

## 1. Create the HubSpot app (Nivomi team, once)

1. Sign in to a HubSpot **developer account** and create an app. Follow HubSpot's current
   official guide; the screens change over time.
2. Set the **redirect URL** to:
   - local development: `http://localhost:3000/api/v1/integrations/crm/hubspot/callback`
   - production: `https://<app host>/api/v1/integrations/crm/hubspot/callback`
3. Configure the scopes exactly as follows. HubSpot blocks the install if the URL's scopes do not
   match the app's settings.
   - **Required:** `crm.objects.contacts.read`, `crm.objects.companies.read`
   - **Optional:** `crm.objects.leads.read`. Accounts without HubSpot's Leads object can still
     connect.
4. Copy the app's **client ID** and **client secret**. Treat the secret like a password: never
   paste it into chat, commit it, or share it in email.

## 2. Configure the API

Put these in the API's environment: `apps/api/.env.local` for local development (git-ignored), or
the secret manager in production.

```dotenv
HUBSPOT_CLIENT_ID=<client id>
HUBSPOT_CLIENT_SECRET=<client secret>
# 32 random bytes, base64. Generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
CREDENTIALS_ENCRYPTION_KEY=<generated key>
```

The API refuses to start with only one of the two HubSpot values, or with HubSpot configured but
no encryption key.

## 3. Connect a customer account

1. An **OWNER** or **ADMIN** opens **Data sources** and clicks **Connect HubSpot**, then approves
   access in HubSpot.
2. Nivomi stores the tokens encrypted and starts a **full sync**:
   - contacts with a phone number become Nivomi leads (source: HubSpot);
   - their companies are attached;
   - HubSpot Leads are linked to those leads.
3. Contacts are **not callable** until consent is mapped. Under **Map a consent property**, name
   the HubSpot property that records consent and map its values to a Consent Basis, or to
   **Opted out** for do-not-call values. Then click **Sync now**.
4. Changes sync automatically every 15 minutes. **Sync now** is available to OWNER, ADMIN and
   MANAGER.

## Behaviour to expect

| Situation                                                        | What Nivomi does                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Contact without a usable phone number                            | Skipped, and counted as "skipped" in the sync                                         |
| Same person already in Nivomi (phone or email)                   | Linked to the existing lead; no duplicate                                             |
| Conflicting match (for example, same phone but a different name) | Sent to **Possible duplicates** for a person to decide                                |
| HubSpot account already connected to another organization        | Refused                                                                               |
| Connecting a different HubSpot account                           | Requires "Connect a different account" and resets the consent mapping                 |
| HubSpot outage or rate limit                                     | Retries with backoff, and the status shows "Degraded"; leads and calls are unaffected |
| Access revoked in HubSpot                                        | Status becomes "Reconnect needed"; syncing stops until reconnected                    |
| Disconnect                                                       | Tokens are revoked and deleted; every lead stays in Nivomi                            |

## Not built yet

Writing call outcomes, notes, meetings and deals back to HubSpot (FR-88–FR-93), and HubSpot
webhooks (FR-94). See the requirements matrix.
