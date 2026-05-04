import { Buffer } from "node:buffer";

const MPESA_BASE_URLS = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
};

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable`);
  }
  return value;
}

export function getMpesaConfig() {
  const environment = process.env.MPESA_ENV === "production" ? "production" : "sandbox";
  return {
    environment,
    baseUrl: MPESA_BASE_URLS[environment],
    consumerKey: requiredEnv("MPESA_CONSUMER_KEY"),
    consumerSecret: requiredEnv("MPESA_CONSUMER_SECRET"),
    shortcode: requiredEnv("MPESA_SHORTCODE"),
    passkey: requiredEnv("MPESA_PASSKEY"),
    callbackBaseUrl: requiredEnv("MPESA_CALLBACK_BASE_URL").replace(/\/$/, ""),
  };
}

export function formatMpesaTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

export function normalizeKenyanPhoneNumber(phoneNumber) {
  const raw = String(phoneNumber || "").replace(/\D/g, "");
  if (raw.startsWith("254") && raw.length === 12) return raw;
  if (raw.startsWith("0") && raw.length === 10) return `254${raw.slice(1)}`;
  if (raw.startsWith("7") && raw.length === 9) return `254${raw}`;
  if (raw.startsWith("1") && raw.length === 9) return `254${raw}`;
  throw new Error("Use a valid Kenyan phone number like 07... or 2547...");
}

export async function getMpesaAccessToken() {
  const { baseUrl, consumerKey, consumerSecret } = getMpesaConfig();
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
    cache: "no-store",
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.errorMessage || data.error_description || "Could not get M-Pesa access token");
  }

  return data.access_token;
}

export async function initiateStkPush({
  amount,
  phoneNumber,
  accountReference,
  transactionDescription,
  callbackUrl,
}) {
  const config = getMpesaConfig();
  const accessToken = await getMpesaAccessToken();
  const timestamp = formatMpesaTimestamp();
  const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString("base64");

  const response = await fetch(`${config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: config.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phoneNumber,
      PartyB: config.shortcode,
      PhoneNumber: phoneNumber,
      CallBackURL: callbackUrl,
      AccountReference: accountReference,
      TransactionDesc: transactionDescription,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.ResponseCode !== "0") {
    throw new Error(data.errorMessage || data.ResponseDescription || "M-Pesa STK push failed");
  }

  return data;
}

export function readCallbackMetadata(items = []) {
  return items.reduce((acc, item) => {
    acc[item.Name] = item.Value;
    return acc;
  }, {});
}
