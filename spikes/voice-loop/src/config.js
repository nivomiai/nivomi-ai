// Spike configuration: read from process.env (loaded by `node --env-file=.env.local`).
// Error messages name missing variables only — never values.

export const LANGUAGES = ['en-IN', 'hi-IN', 'ml-IN', 'ta-IN', 'te-IN', 'kn-IN'];

const E164 = /^\+[1-9]\d{7,14}$/;

const GROUPS = {
  exotel: [
    'EXOTEL_ACCOUNT_SID',
    'EXOTEL_API_KEY',
    'EXOTEL_API_TOKEN',
    'EXOTEL_API_HOST',
    'EXOTEL_CALLER_ID',
  ],
  sarvam: ['SARVAM_API_KEY'],
  llm: ['LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'],
  runtime: ['PUBLIC_BASE_URL', 'SPIKE_STREAM_TOKEN', 'SPIKE_TEST_PHONE_A'],
};

/** @param {Array<keyof typeof GROUPS>} groups */
export function loadConfig(groups, env = process.env) {
  const value = (name) => (env[name] ?? '').trim();
  const missing = groups.flatMap((g) => GROUPS[g]).filter((name) => value(name) === '');
  if (missing.length > 0) {
    throw new Error(`Missing in .env.local: ${missing.join(', ')}`);
  }
  if (groups.includes('runtime')) {
    if (value('SPIKE_STREAM_TOKEN').length < 24) {
      throw new Error('SPIKE_STREAM_TOKEN must be at least 24 characters');
    }
    for (const name of ['SPIKE_TEST_PHONE_A', 'SPIKE_TEST_PHONE_B']) {
      if (value(name) !== '' && !E164.test(value(name))) {
        throw new Error(`${name} must be in E.164 format, e.g. +9198XXXXXXXX`);
      }
    }
    if (!value('PUBLIC_BASE_URL').startsWith('https://')) {
      throw new Error('PUBLIC_BASE_URL must be an https:// tunnel URL');
    }
  }
  return {
    exotel: {
      accountSid: value('EXOTEL_ACCOUNT_SID'),
      apiKey: value('EXOTEL_API_KEY'),
      apiToken: value('EXOTEL_API_TOKEN'),
      host: value('EXOTEL_API_HOST'),
      callerId: value('EXOTEL_CALLER_ID'),
      flowAppId: value('EXOTEL_FLOW_APP_ID'),
    },
    sarvam: {
      apiKey: value('SARVAM_API_KEY'),
      sttModel: value('SARVAM_STT_MODEL') || 'saaras:v3-realtime',
      sttMode: value('SARVAM_STT_MODE') || 'transcribe',
      ttsModel: value('SARVAM_TTS_MODEL') || 'bulbul:v3',
      ttsSpeaker: value('SARVAM_TTS_SPEAKER') || 'shubh',
    },
    llm: {
      baseUrl: value('LLM_BASE_URL').replace(/\/+$/, ''),
      apiKey: value('LLM_API_KEY'),
      model: value('LLM_MODEL'),
    },
    port: Number(value('PORT') || 8080),
    publicBaseUrl: value('PUBLIC_BASE_URL').replace(/\/+$/, ''),
    streamToken: value('SPIKE_STREAM_TOKEN'),
    testPhones: [value('SPIKE_TEST_PHONE_A'), value('SPIKE_TEST_PHONE_B')].filter(Boolean),
    maxCallSeconds: Number(value('SPIKE_MAX_CALL_SECONDS') || 240),
  };
}
