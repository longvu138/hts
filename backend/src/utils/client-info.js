const normalizeHeader = (value, maxLength = 500) =>
  String(value || "").trim().slice(0, maxLength) || null;

const detectBrowser = (userAgent = "") => {
  const patterns = [
    ["Edge", /Edg\/([\d.]+)/],
    ["Chrome", /Chrome\/([\d.]+)/],
    ["Firefox", /Firefox\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, pattern] of patterns) {
    const match = userAgent.match(pattern);
    if (match) return `${name} ${match[1]}`;
  }
  return "Unknown";
};

const detectOs = (userAgent = "") => {
  if (/Windows NT/i.test(userAgent)) return "Windows";
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Mac OS X/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Unknown";
};

const detectDeviceType = (userAgent = "") => {
  if (/iPad|Tablet/i.test(userAgent)) return "tablet";
  if (/Mobile|Android|iPhone|iPod/i.test(userAgent)) return "mobile";
  return "desktop";
};

const getClientInfo = (req) => {
  const userAgent = normalizeHeader(req.get?.("user-agent"));
  return {
    ipAddress: normalizeHeader(req.ip || req.socket?.remoteAddress, 64),
    userAgent,
    browser: detectBrowser(userAgent || ""),
    os: detectOs(userAgent || ""),
    deviceType: detectDeviceType(userAgent || ""),
  };
};

module.exports = {
  getClientInfo,
};
