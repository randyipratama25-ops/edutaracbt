import type { NextConfig } from "next";
const config: NextConfig = {
  // Isolate the temporary UI verification server from normal dev/build caches.
  distDir: process.env.EDUTARA_UI_TEST_DIST || ".next",
  serverExternalPackages: [
    "@sparticuz/chromium",
    "puppeteer-core",
    "pdf-lib",
    "exceljs",
  ],
  outputFileTracingIncludes: {
    "/api/cards{,/**}": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "./public/fonts/**",
      "./node_modules/katex/dist/**",
    ],
    "/api/reports/**": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "./public/fonts/**",
      "./node_modules/katex/dist/**",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
