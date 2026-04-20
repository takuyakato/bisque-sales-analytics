import iconv from 'iconv-lite';

/**
 * CP932 (Shift-JIS互換) で書かれたCSVバッファを UTF-8 文字列にデコードする
 * DLsite / Fanza のCSVは両方とも CP932
 */
export function decodeCP932(buffer: Buffer | Uint8Array): string {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return iconv.decode(buf, 'cp932');
}
