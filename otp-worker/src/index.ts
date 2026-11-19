export type KVNamespaceBinding = {
  get<T = unknown>(
    key: string,
    type?: 'text' | 'json' | 'arrayBuffer' | 'stream'
  ): Promise<T | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: { expiration?: number; expirationTtl?: number }
  ): Promise<void>;
  delete(key: string): Promise<void>;
};

export interface Env {
  OTP_KV: KVNamespaceBinding;
  FIREBASE_PROJECT_ID: string;
  BREVO_API_KEY: string;
  OTP_HMAC_SECRET: string;
}

interface JWKKey {
  kty: string;
  alg: string;
  use: string;
  kid: string;
  n: string;
  e: string;
  [key: string]: unknown;
}

interface JWKSet {
  keys: JWKKey[];
}

interface FirebaseJwtHeader {
  alg: string;
  kid: string;
  typ?: string;
}

interface FirebaseJwtPayload {
  iss: string;
  aud: string;
  auth_time: number;
  user_id: string;
  sub: string;
  iat: number;
  exp: number;
  email?: string;
  email_verified?: boolean;
  [key: string]: unknown;
}

interface OtpRecord {
  hash: string;
  attempts: number;
  expiresAt: number;
  lastSentAt: number;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

let cachedJwks: JWKKey[] | null = null;
let jwksCacheExpires = 0;

async function fetchGoogleJwks(): Promise<JWKKey[]> {
  const now = Date.now();
  if (cachedJwks && now < jwksCacheExpires) {
    return cachedJwks;
  }

  const response = await fetch(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch Google JWKS: ${response.status}`);
  }

  const data = (await response.json()) as JWKSet;
  cachedJwks = data.keys || [];
  jwksCacheExpires = now + 60 * 60 * 1000; // Cache for 1 hour
  return cachedJwks;
}

function base64UrlToBytes(base64Url: string): Uint8Array {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeBase64UrlJson<T>(base64Url: string): T {
  const bytes = base64UrlToBytes(base64Url);
  const decoded = new TextDecoder().decode(bytes);
  return JSON.parse(decoded) as T;
}

async function verifyFirebaseToken(
  authHeader: string | null,
  projectId: string
): Promise<FirebaseJwtPayload> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeBase64UrlJson<FirebaseJwtHeader>(headerB64);
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported JWT algorithm or missing key ID');
  }

  const payload = decodeBase64UrlJson<FirebaseJwtPayload>(payloadB64);

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp <= nowSec) {
    throw new Error('Token has expired');
  }

  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  if (payload.iss !== expectedIssuer) {
    throw new Error(`Invalid token issuer: expected ${expectedIssuer}`);
  }

  if (payload.aud !== projectId) {
    throw new Error(`Invalid token audience: expected ${projectId}`);
  }

  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Invalid token subject (UID)');
  }

  if (payload.email_verified !== true) {
    throw new Error('Email must be verified before proceeding with OTP');
  }

  // Cryptographic RS256 signature verification against Google JWKS
  const jwks = await fetchGoogleJwks();
  const matchingKey = jwks.find((k) => k.kid === header.kid);
  if (!matchingKey) {
    throw new Error('Matching public key not found in Google JWKS');
  }

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    matchingKey,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['verify']
  );

  const signedContent = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signatureBytes = base64UrlToBytes(signatureB64);

  const isSignatureValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureBytes as unknown as BufferSource,
    signedContent as unknown as BufferSource
  );

  if (!isSignatureValid) {
    throw new Error('Invalid token signature');
  }

  return payload;
}

async function computeHmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function generateSecure6DigitOtp(): string {
  const uint32 = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(uint32);
    value = uint32[0];
  } while (value >= 4294000000); // Rejection sampling to prevent modulo bias
  return (value % 1000000).toString().padStart(6, '0');
}

export async function sendEmailViaBrevo(
  apiKey: string,
  toEmail: string,
  otpCode: string
): Promise<void> {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'LeafLink Security', email: 'naruto.gaonkar2599@gmail.com' },
      to: [{ email: toEmail }],
      subject: 'LeafLink Security Verification Code',
      htmlContent: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 28px; border: 1px solid #E2E8F0; border-radius: 12px; background-color: #FFFFFF;">
          <h2 style="color: #2D5A27; margin-top: 0; font-size: 22px;">LeafLink Verification</h2>
          <p style="color: #4A5568; font-size: 15px; line-height: 1.5;">
            You requested to update your account password. Enter this verification code to confirm your identity:
          </p>
          <div style="margin: 28px 0; padding: 18px; text-align: center; background-color: #F0FDF4; border: 1px dashed #86EFAC; border-radius: 10px; letter-spacing: 8px; font-size: 34px; font-weight: 700; color: #166534;">
            ${otpCode}
          </div>
          <p style="color: #718096; font-size: 13px; line-height: 1.4;">
            This verification code is valid for <strong>5 minutes</strong>. If you did not initiate this request, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #EDF2F7; margin: 24px 0 16px 0;" />
          <p style="color: #A0AEC0; font-size: 11px; margin-bottom: 0;">
            LeafLink Automated Security Notification
          </p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    throw new Error('OTP_DELIVERY_FAILED');
  }
}

export async function deliverStoredOtp(env: Env, kvKey: string, email: string, code: string): Promise<boolean> {
  try {
    await sendEmailViaBrevo(env.BREVO_API_KEY, email, code);
    return true;
  } catch {
    await env.OTP_KV.delete(kvKey);
    return false;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/send-otp') {
        if (request.method !== 'POST') {
          return jsonResponse({ error: 'Method Not Allowed' }, 405);
        }

        const payload = await verifyFirebaseToken(
          request.headers.get('Authorization'),
          env.FIREBASE_PROJECT_ID
        );

        const uid = payload.sub;
        const email = payload.email;
        if (!email) {
          return jsonResponse({ error: 'No verified email address found on user profile' }, 400);
        }

        const kvKey = `otp:${uid}`;
        const existingRecord = await env.OTP_KV.get<OtpRecord>(kvKey, 'json');
        const now = Date.now();

        // 60-second resend cooldown per UID
        if (existingRecord && existingRecord.lastSentAt && now - existingRecord.lastSentAt < 60000) {
          const waitSeconds = Math.ceil((60000 - (now - existingRecord.lastSentAt)) / 1000);
          return jsonResponse(
            {
              error: `Please wait ${waitSeconds} seconds before requesting a new code.`,
              retryAfter: waitSeconds,
            },
            429
          );
        }

        const otpCode = generateSecure6DigitOtp();
        const hash = await computeHmacSha256(env.OTP_HMAC_SECRET, otpCode);
        const expiresAt = now + 300 * 1000; // 5 minutes (300s)

        const newRecord: OtpRecord = {
          hash,
          attempts: 0,
          expiresAt,
          lastSentAt: now,
        };

        await env.OTP_KV.put(kvKey, JSON.stringify(newRecord), { expirationTtl: 300 });

        if (!(await deliverStoredOtp(env, kvKey, email, otpCode))) {
          return jsonResponse({ code: 'OTP_DELIVERY_FAILED', error: 'Unable to send the verification code. Please try again later.' }, 502);
        }

        return jsonResponse({
          success: true,
          message: 'OTP sent successfully',
        });
      }

      if (path === '/verify-otp') {
        if (request.method !== 'POST') {
          return jsonResponse({ error: 'Method Not Allowed' }, 405);
        }

        const payload = await verifyFirebaseToken(
          request.headers.get('Authorization'),
          env.FIREBASE_PROJECT_ID
        );

        const uid = payload.sub;

        let body: { code?: string } = {};
        try {
          body = (await request.json()) as { code?: string };
        } catch {
          return jsonResponse({ error: 'Invalid JSON request body' }, 400);
        }

        const code = body.code?.trim();
        if (!code || !/^\d{6}$/.test(code)) {
          return jsonResponse({ code: 'OTP_INVALID', error: 'Please enter a valid 6-digit verification code' }, 400);
        }

        const kvKey = `otp:${uid}`;
        const record = await env.OTP_KV.get<OtpRecord>(kvKey, 'json');
        const now = Date.now();

        if (!record || now > record.expiresAt) {
          if (record) {
            await env.OTP_KV.delete(kvKey);
          }
          return jsonResponse(
            { code: 'OTP_EXPIRED', error: 'Verification code expired or not found. Please request a new one.' },
            400
          );
        }

        const inputHash = await computeHmacSha256(env.OTP_HMAC_SECRET, code);
        const isValid = constantTimeEqual(inputHash, record.hash);

        if (isValid) {
          // Immediately delete key so codes are strictly single-use
          await env.OTP_KV.delete(kvKey);
          return jsonResponse({ success: true, verified: true });
        }

        // Invalid code: track failed attempts
        record.attempts += 1;
        if (record.attempts >= 5) {
          await env.OTP_KV.delete(kvKey);
          return jsonResponse(
            { code: 'OTP_ATTEMPTS_EXCEEDED', error: 'Too many invalid attempts. This verification code has been invalidated.' },
            400
          );
        }

        const remainingTtl = Math.max(60, Math.floor((record.expiresAt - now) / 1000));
        await env.OTP_KV.put(kvKey, JSON.stringify(record), { expirationTtl: remainingTtl });

        const attemptsRemaining = 5 - record.attempts;
        return jsonResponse(
          {
            error: `Invalid code. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining.`,
            code: 'OTP_INVALID',
            attemptsRemaining,
          },
          400
        );
      }

      return jsonResponse({ error: 'Not Found' }, 404);
    } catch (err: any) {
      const message = err?.message || 'Internal server error';
      const isAuthError =
        message.includes('Token') ||
        message.includes('Authorization') ||
        message.includes('JWT') ||
        message.includes('issuer') ||
        message.includes('audience') ||
        message.includes('subject') ||
        message.includes('verified') ||
        message.includes('signature') ||
        message.includes('JWKS');

      return jsonResponse({ code: isAuthError ? 'OTP_AUTH_REQUIRED' : 'OTP_INTERNAL_ERROR', error: isAuthError ? 'Please sign in again with a verified email address.' : 'Unable to process verification. Please try again later.' }, isAuthError ? 401 : 500);
    }
  },
};
