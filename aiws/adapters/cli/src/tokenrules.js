// Five rules that keep an agent from spending tokens on redundant work. Adapted from
// https://github.com/vannt-dev/token-efficient-work (MIT); the text is copied here, nothing is installed.

const SOURCE = 'https://github.com/vannt-dev/token-efficient-work';

const RULES = {
  en: [
    'Search or locate before reading; read only the range you need, not whole files.',
    'Do not re-read a file to confirm an edit that already reported success.',
    'Check in proportion to risk: name the risk before adding a check nobody asked for. ' +
      'In `aiws run` the orchestrator builds and runs the full test suites after you.',
    'Reuse facts already established in this session or run instead of fetching them again.',
    'Keep your report as short as its content allows; do not restate diffs or tool output in prose.',
  ],
  vi: [
    'Tìm vị trí trước khi đọc; chỉ đọc đoạn cần, không đọc cả file.',
    'Không đọc lại file chỉ để xác nhận một lần sửa đã báo thành công.',
    'Kiểm tra theo mức rủi ro: nêu rõ rủi ro trước khi thêm một bước kiểm tra không ai yêu cầu. ' +
      'Trong `aiws run`, orchestrator build và chạy đủ bộ test sau bạn.',
    'Dùng lại thông tin đã có trong phiên hoặc lượt chạy này, không lấy lại.',
    'Báo cáo ngắn nhất mà nội dung cho phép; không kể lại diff hay output của tool bằng lời.',
  ],
};

const HEADING = { en: 'Token-efficient work', vi: 'Làm việc tiết kiệm token' };

/** Whether the rules go to the agents: runtime.yaml `token_efficient`, on unless set to false. */
export function tokenRulesOn(ws) {
  return ws.runtime?.token_efficient !== false;
}

/**
 * The rules as a Markdown section with a heading of `level` (1 for a generated agent file, 2 inside a run
 * prompt), in `lang` (vi or en); '' when runtime.yaml turns them off.
 */
export function tokenRules(ws, { lang = ws.language, level = 1 } = {}) {
  if (!tokenRulesOn(ws)) return '';
  const l = lang === 'en' ? 'en' : 'vi';
  const lines = RULES[l].map((r, i) => `${i + 1}. ${r}`);
  return `${'#'.repeat(level)} ${HEADING[l]}\n${lines.join('\n')}\n(${SOURCE})`;
}
