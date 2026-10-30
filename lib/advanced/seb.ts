// Pilot configuration only. No Browser Exam Key/Config Key validation is claimed.
export function pilotConfig(origin: string) {
  const u = new URL(origin);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    !(
      u.hostname === "edutara-cbt-ashen.vercel.app" ||
      /^edutara-[a-z0-9-]+-randyipratama25-2274\.vercel\.app$/.test(u.hostname)
    )
  )
    throw Error("Origin uji tidak diizinkan.");
  const xml = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>startURL</key><string>${xml(u.origin + "/login")}</string><key>sebConfigPurpose</key><integer>0</integer><key>allowQuit</key><true/><key>sendBrowserExamKey</key><false/><key>browserWindowAllowReload</key><true/><key>showReloadButton</key><true/><key>enableJavaScript</key><true/><key>removeLocalStorage</key><false/><key>originatorVersion</key><string>EDUTARA pilot-v1</string></dict></plist>`;
}
