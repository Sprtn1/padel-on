// PADEL ON: Admin-only delivery of a locally generated Arabic accounting PDF.
// Never writes PDF data to PostgreSQL, Supabase Storage or application logs.
// Configure WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TO_NUMBER,
// WHATSAPP_TEMPLATE_NAME, WHATSAPP_TEMPLATE_LANGUAGE (en_US or ar), optionally
// WHATSAPP_GRAPH_VERSION. Create an APPROVED WhatsApp template with a DOCUMENT
// HEADER parameter and a fixed body (e.g. "PADEL ON daily accounting sheet").
import { createClient } from "npm:@supabase/supabase-js@2";

const SOURCE_ORIGIN = "https://padelon.publicvm.com";
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const respond = (data: unknown, status: number, origin: string | null) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    ...(origin === SOURCE_ORIGIN ? { "Access-Control-Allow-Origin": SOURCE_ORIGIN } : {}),
  },
});
const env = (name: string) => (Deno.env.get(name) || "").trim();

export function whatsappConfig() {
  const token = env("WHATSAPP_ACCESS_TOKEN");
  const phoneId = env("WHATSAPP_PHONE_NUMBER_ID");
  const recipient = env("WHATSAPP_TO_NUMBER").replace(/[ +()\-]/g, "");
  const template = env("WHATSAPP_TEMPLATE_NAME");
  const language = env("WHATSAPP_TEMPLATE_LANGUAGE") || "en_US";
  const version = env("WHATSAPP_GRAPH_VERSION") || "v24.0";
  const configured = Boolean(token && /^\d{8,30}$/.test(phoneId) &&
    /^\d{8,15}$/.test(recipient) && /^[a-z][a-z0-9_]{1,200}$/.test(template) &&
    /^[a-z]{2}(?:_[A-Z]{2})?$/.test(language) && /^v\d{1,3}\.\d{1,2}$/.test(version));
  return { configured, token, phoneId, recipient, template, language, version };
}

export function whatsappDocumentTemplate(config: ReturnType<typeof whatsappConfig>, mediaId: string, date: string) {
  return {
    messaging_product: "whatsapp",
    to: config.recipient,
    type: "template",
    template: {
      name: config.template,
      language: { code: config.language },
      components: [{
        type: "header",
        parameters: [{
          type: "document",
          document: { id: mediaId, filename: "padel-on-daily-sheet-" + date + ".pdf" },
        }],
      }],
    },
  };
}

function publishableKey(): string {
  const legacy = env("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(env("SUPABASE_PUBLISHABLE_KEYS"));
    return Deno.env.get(keys.default) || keys.default || "";
  } catch { return ""; }
}
async function requireAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/.test(auth)) return false;
  const url = env("SUPABASE_URL"), key = publishableKey();
  if (!url || !key) return false;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
  const jwt = auth.replace(/^Bearer\s+/i, "");
  const { data: userData, error: authError } = await client.auth.getUser(jwt);
  if (authError || !userData.user?.id) return false;
  // is_admin() checks the logged-in staff profile in PostgreSQL, not any
  // self-editable user_metadata or an arbitrary role supplied by the browser.
  const { data: admin, error: roleError } = await client.rpc("is_admin");
  return !roleError && admin === true;
}
async function metaResult(response: Response, action: string) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof data?.error?.code === "number" ? " (Meta " + data.error.code + ")" : "";
    throw new Error(action + " failed" + code + ". Check Meta Business settings and template approval.");
  }
  if (!data || typeof data !== "object") throw new Error(action + " returned invalid response.");
  return data;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
        "Access-Control-Max-Age": "600",
        ...(origin === SOURCE_ORIGIN ? { "Access-Control-Allow-Origin": SOURCE_ORIGIN } : {}),
        "Vary": "Origin",
      },
    });
  }
  if (origin && origin !== SOURCE_ORIGIN) return respond({ error: "Origin not allowed." }, 403, origin);
  if (req.method !== "POST") return respond({ error: "POST only." }, 405, origin);
  let admin = false;
  try { admin = await requireAdmin(req); }
  catch { return respond({ error: "Could not verify administrator session." }, 401, origin); }
  if (!admin) return respond({ error: "Administrator authorization required." }, 403, origin);

  const config = whatsappConfig();
  const type = req.headers.get("Content-Type") || "";
  if (type.includes("application/json")) {
    const body = await req.json().catch(() => null);
    if (body?.action === "status") {
      return respond({ configured: config.configured }, 200, origin);
    }
    return respond({ error: "Unsupported action." }, 400, origin);
  }
  if (!config.configured) return respond({
    error: "WhatsApp delivery is not configured. Add the secure WhatsApp phone, recipient, token, and approved template settings.",
  }, 503, origin);
  if (!type.includes("multipart/form-data")) return respond({ error: "Expected a PDF upload." }, 415, origin);
  if (Number(req.headers.get("content-length") || 0) > MAX_PDF_BYTES + 3000)
    return respond({ error: "PDF exceeds the maximum size." }, 413, origin);

  let form: FormData;
  try { form = await req.formData(); } catch { return respond({ error: "Invalid PDF request." }, 400, origin); }
  const file = form.get("pdf");
  const date = form.get("date");
  if (!(file instanceof File) || file.type !== "application/pdf" || file.size < 100 ||
      file.size > MAX_PDF_BYTES || typeof date !== "string" ||
      !/^20\d{2}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date+"T12:00:00Z"))) {
    return respond({ error: "A valid dated PDF file is required." }, 400, origin);
  }
  const signature = new TextDecoder().decode(new Uint8Array(await file.slice(0, 5).arrayBuffer()));
  if (signature !== "%PDF-") return respond({ error: "The uploaded file is not a PDF." }, 400, origin);

  const url = "https://graph.facebook.com/" + config.version + "/" + config.phoneId;
  const authHeaders = { Authorization: "Bearer " + config.token };
  let mediaId = "";
  try {
    const upload = new FormData();
    upload.append("messaging_product", "whatsapp");
    upload.append("type", "application/pdf");
    upload.append("file", file, "padel-on-daily-sheet-" + date + ".pdf");
    const media = await metaResult(await fetch(url + "/media", {
      method: "POST", headers: authHeaders, body: upload,
    }), "WhatsApp media upload");
    mediaId = String(media.id || "");
    if (!/^\d{6,40}$/.test(mediaId)) throw new Error("WhatsApp did not return a valid media ID.");

    const sent = await metaResult(await fetch(url + "/messages", {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(whatsappDocumentTemplate(config, mediaId, date)),
    }), "WhatsApp message");
    if (!sent.messages?.[0]?.id) throw new Error("WhatsApp did not accept the message.");
    // The media is Meta-hosted for delivery and may be retained by Meta.
    // No PDF copy or message bytes are saved in Supabase databases or Storage.
    // Acceptance is not the same as confirmed delivery to the handset.
    return respond({ accepted: true, messageId: sent.messages[0].id }, 200, origin);
  } catch (error) {
    // If message submission failed, remove the temporary Meta media where possible.
    // Never delete successfully submitted media before WhatsApp has delivered it.
    if (mediaId) {
      try { await fetch("https://graph.facebook.com/" + config.version + "/" + mediaId, {
        method: "DELETE", headers: authHeaders,
      }); } catch { /* best effort only */ }
    }
    return respond({ error: error instanceof Error ? error.message : "WhatsApp delivery failed." }, 502, origin);
  }
});
