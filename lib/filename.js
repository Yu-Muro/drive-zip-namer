// ファイル名まわりの純粋関数。service worker / popup / options / テストから共用する。

const FORBIDDEN_CHARS = /[\\/:*?"<>|]/g;
const FALLBACK_BASENAME = "google-drive-download";

/**
 * 入力文字列を安全な "xxx.zip" 形式に整える。
 * - 末尾の .zip は一旦除去してから付け直す（二重拡張子防止）
 * - Windows / macOS で使えない文字は _ に置換
 * - 先頭・末尾の空白とドットを除去
 * - 空になった場合はフォールバック名
 */
export function sanitizeZipFilename(input) {
  const withoutExtension = String(input ?? "").replace(/\.zip$/i, "");

  const sanitized = withoutExtension
    .replace(FORBIDDEN_CHARS, "_")
    .replace(/[\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  const base = sanitized || FALLBACK_BASENAME;
  return `${base}.zip`;
}

/**
 * テンプレート変数 {date} {time} {datetime} を展開する。
 * Drive画面情報が要る {folder} {count} は Phase 3 で対応予定のため未展開のまま残す。
 */
export function applyTemplate(input, now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;

  return String(input ?? "")
    .replaceAll("{date}", date)
    .replaceAll("{time}", time)
    .replaceAll("{datetime}", `${date}_${time}`);
}

/**
 * 分割ZIP用の連番ファイル名を作る。
 * sequence 1 はそのまま、2以降は "name_part2.zip" 形式。
 */
export function buildSequencedFilename(zipFilename, sequence) {
  if (sequence <= 1) {
    return zipFilename;
  }
  const base = zipFilename.replace(/\.zip$/i, "");
  return `${base}_part${sequence}.zip`;
}

/**
 * 保存先サブフォルダを付ける。フォルダ名も安全化する。
 */
export function withSaveFolder(zipFilename, saveFolder) {
  const folder = String(saveFolder ?? "")
    .replace(FORBIDDEN_CHARS, "_")
    .replace(/^[. ]+|[. ]+$/g, "")
    .trim();

  return folder ? `${folder}/${zipFilename}` : zipFilename;
}
