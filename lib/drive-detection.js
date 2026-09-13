// Google Drive由来のZIPダウンロード判定。
// 実際の配信URLは drive.google.com ではなく *.googleusercontent.com になることが
// あるため、両方を対象にする。

const DRIVE_HOSTNAMES = [
  "drive.google.com",
  "googleusercontent.com",
  "drive.usercontent.google.com"
];

function isDriveHostname(hostname) {
  const normalized = hostname.toLowerCase();
  return DRIVE_HOSTNAMES.some(
    (domain) => normalized === domain || normalized.endsWith(`.${domain}`)
  );
}

function isDriveUrl(value) {
  if (!value) return false;
  try {
    return isDriveHostname(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function isGoogleDriveZip(downloadItem) {
  const filename = downloadItem?.filename ?? "";
  const mime = downloadItem?.mime ?? "";

  const isZip =
    filename.toLowerCase().endsWith(".zip") ||
    mime === "application/zip" ||
    mime === "application/x-zip-compressed";

  const isDriveRelated = [downloadItem?.url, downloadItem?.finalUrl].some(isDriveUrl);

  return isZip && isDriveRelated;
}
