const EMBEDDED_BROWSER_SIGNATURES = [
  {
    application: "messenger",
    pattern:
      /\bMessengerForiOS\b|\bFBAN\/(?:MessengerForiOS|Orca-Android|EMA)\b|\bFB_IAB\/Messenger\b/i,
  },
  {
    application: "facebook",
    pattern: /\bFBAN\/|\bFBAV\/|\bFB_IAB\b|\bFBIOS\b/i,
  },
  {
    application: "reddit",
    pattern: /\bReddit(?:\/|\b)|com\.reddit\.frontpage/i,
  },
  { application: "instagram", pattern: /\bInstagram\b/i },
  {
    application: "tiktok",
    pattern: /\bTikTok\b|\bmusical_ly\b|\bBytedanceWebview\b/i,
  },
  { application: "threads", pattern: /\bThreads\b|\bBarcelona\b/i },
  { application: "linkedin", pattern: /\bLinkedInApp\b/i },
  { application: "snapchat", pattern: /\bSnapchat\b/i },
  { application: "wechat", pattern: /\bMicroMessenger\b/i },
  { application: "line", pattern: /\bLine\/[\d.]+/i },
  { application: "twitter", pattern: /\bTwitter(?:Android| for iPhone)?\b/i },
  { application: "discord", pattern: /\bDiscord\b/i },
  { application: "telegram", pattern: /\bTelegram\b/i },
  { application: "whatsapp", pattern: /\bWhatsApp\b/i },
  { application: "pinterest", pattern: /\bPinterest\b/i },
  { application: "slack", pattern: /\bSlack\b/i },
];

function isIosDevice(userAgent, platform, maxTouchPoints) {
  return (
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (platform === "MacIntel" && Number(maxTouchPoints) > 1)
  );
}

function isAndroidDevice(userAgent) {
  return /\bAndroid\b/i.test(userAgent);
}

function isAndroidWebView(userAgent) {
  return (
    /(?:^|[ (;])wv(?:[ );]|$)/i.test(userAgent) ||
    /\bVersion\/4\.0\b.*\bChrome\/[\d.]+\b.*\bMobile Safari\/[\d.]+/i.test(
      userAgent,
    )
  );
}

function isIosWebView(userAgent) {
  return (
    /\bAppleWebKit\/[\d.]+/i.test(userAgent) &&
    !/\bSafari\/[\d.]+/i.test(userAgent)
  );
}

export function detectEmbeddedBrowser({
  userAgent = "",
  platform = "",
  maxTouchPoints = 0,
  standalone = false,
} = {}) {
  if (standalone) return null;

  const normalizedUserAgent = String(userAgent);
  const ios = isIosDevice(
    normalizedUserAgent,
    String(platform),
    maxTouchPoints,
  );
  const android = isAndroidDevice(normalizedUserAgent);
  const signature = EMBEDDED_BROWSER_SIGNATURES.find(({ pattern }) =>
    pattern.test(normalizedUserAgent),
  );
  const genericAndroidWebView =
    android && isAndroidWebView(normalizedUserAgent);
  const genericIosWebView = ios && isIosWebView(normalizedUserAgent);

  if (!signature && !genericAndroidWebView && !genericIosWebView) {
    return null;
  }

  return {
    application: signature?.application ?? null,
    platform: ios ? "ios" : android ? "android" : "other",
    reason: signature
      ? "application-signature"
      : genericAndroidWebView
        ? "android-webview"
        : "ios-webview",
  };
}

export function chromeIntentUrl(pageUrl) {
  const url = new URL(pageUrl);
  if (!["http:", "https:"].includes(url.protocol)) return url.href;

  const scheme = url.protocol.slice(0, -1);
  const destination = `${url.host}${url.pathname}${url.search}`;
  const fallback = encodeURIComponent(url.href);
  return (
    `intent://${destination}` +
    `#Intent;scheme=${scheme};package=com.android.chrome;` +
    `S.browser_fallback_url=${fallback};end`
  );
}

async function copyText(text, navigatorObject, documentObject) {
  try {
    if (navigatorObject.clipboard?.writeText) {
      await navigatorObject.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Certains navigateurs intégrés exposent l’API sans autoriser son usage.
  }

  const textarea = documentObject.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  documentObject.body.append(textarea);
  textarea.select();

  try {
    return documentObject.execCommand?.("copy") === true;
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

export function activateEmbeddedBrowserGuard({
  documentObject = globalThis.document,
  navigatorObject = globalThis.navigator,
  windowObject = globalThis.window,
  copiedMessage = "Copied",
  copyFailedMessage = "Copy failed",
} = {}) {
  const installedDisplayMode = ["standalone", "fullscreen"].some(
    (mode) =>
      windowObject?.matchMedia?.(`(display-mode: ${mode})`)?.matches === true,
  );
  const standalone =
    navigatorObject?.standalone === true ||
    installedDisplayMode;
  const detection = detectEmbeddedBrowser({
    userAgent: navigatorObject?.userAgent,
    platform: navigatorObject?.platform,
    maxTouchPoints: navigatorObject?.maxTouchPoints,
    standalone,
  });
  if (!detection) return null;

  const guard = documentObject?.querySelector?.("#embedded-browser-guard");
  if (!guard) return detection;

  const pageUrl = windowObject.location.href;
  const main = documentObject.querySelector("main");
  const androidAction = guard.querySelector("#embedded-browser-android-action");
  const iosHelp = guard.querySelector("#embedded-browser-ios-help");
  const genericHelp = guard.querySelector("#embedded-browser-generic-help");
  const openButton = guard.querySelector("#open-in-chrome");
  const copyButton = guard.querySelector("#copy-external-link");
  const copyStatus = guard.querySelector("#copy-external-link-status");

  documentObject.body.classList.add("embedded-browser-blocked");
  main?.setAttribute("aria-hidden", "true");
  main?.setAttribute("inert", "");
  guard.dataset.embeddedBrowser =
    detection.application ?? detection.reason;
  guard.hidden = false;

  const onAndroid = detection.platform === "android";
  const onIos = detection.platform === "ios";
  androidAction.hidden = !onAndroid;
  iosHelp.hidden = !onIos;
  genericHelp.hidden = onIos;

  if (onAndroid) {
    openButton.href = chromeIntentUrl(pageUrl);
  }

  copyButton.addEventListener("click", async () => {
    copyButton.disabled = true;
    const copied = await copyText(
      pageUrl,
      navigatorObject,
      documentObject,
    );
    copyStatus.textContent = copied ? copiedMessage : copyFailedMessage;
    copyButton.disabled = false;
  });

  (onAndroid ? openButton : copyButton).focus({ preventScroll: true });
  return detection;
}
