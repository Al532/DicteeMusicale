import "./lick-trainer-integration.js";

const appCoreUrl = new URL("./app-core.js", import.meta.url);
appCoreUrl.search = new URL(import.meta.url).search;
await import(appCoreUrl.href);
