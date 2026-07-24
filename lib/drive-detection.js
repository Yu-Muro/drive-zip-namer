// Google Drive由来のZIPダウンロード判定。
// 実際の配信URLは drive.google.com ではなく *.googleusercontent.com になることが
// あるため、両方を対象にする。

const DRIVE_URL_PATTERNS = [
  "drive.google.com",
  "googleusercontent.com",
  "drive.usercontent.google.com"
];

export function isGoogleDriveZip(downloadItem) {
  const url = `${downloadItem?.url ?? ""} ${downloadItem?.finalUrl ?? ""}`;
  const filename = downloadItem?.filename ?? "";
  const mime = downloadItem?.mime ?? "";

  const isZip =
    filename.toLowerCase().endsWith(".zip") ||
    mime === "application/zip" ||
    mime === "application/x-zip-compressed";

  const isDriveRelated = DRIVE_URL_PATTERNS.some((pattern) =>
    url.includes(pattern)
  );

  return isZip && isDriveRelated;
}
