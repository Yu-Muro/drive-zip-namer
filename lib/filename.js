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

// テンプレートで使える変数の一覧（UIのヘルプ表示にも使う）
export const TEMPLATE_VARIABLES = [
  { name: "{date}", label: "日付", example: "2026-07-24" },
  { name: "{time}", label: "時刻", example: "1430" },
  { name: "{datetime}", label: "日時", example: "2026-07-24_1430" },
  { name: "{project}", label: "プロジェクト名", example: "Canna" },
  { name: "{folder}", label: "Driveフォルダ名", example: "請求書" },
  { name: "{count}", label: "選択ファイル数", example: "12" }
];

/**
 * テンプレート変数を展開する。
 *
 * - {date} {time} {datetime} は vars.now（既定は現在時刻）から生成
 * - {project} {folder} {count} は vars に値があるときだけ展開する。
 *   値が無い変数は展開せずそのまま残す（プレビューで変数名が見えるように）。
 *
 * @param {string} input
 * @param {{now?: Date, project?: string, folder?: string, count?: number|string}} [vars]
 */
export function applyTemplate(input, vars = {}) {
  // 後方互換: 第2引数に Date を直接渡された場合も許容する
  const v = vars instanceof Date ? { now: vars } : vars || {};
  const now = v.now ?? new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;

  let out = String(input ?? "")
    .replaceAll("{date}", date)
    .replaceAll("{time}", time)
    .replaceAll("{datetime}", `${date}_${time}`);

  if (v.project != null) out = out.replaceAll("{project}", String(v.project));
  if (v.folder != null) out = out.replaceAll("{folder}", String(v.folder));
  if (v.count != null) out = out.replaceAll("{count}", String(v.count));

  return out;
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
