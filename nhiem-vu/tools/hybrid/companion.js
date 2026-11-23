const token = location.hash.slice(1);
history.replaceState(null, '', '/');
const form = document.querySelector('#ocr');
const status = document.querySelector('#status');
const result = document.querySelector('#result');
const button = form.querySelector('button');
const fields = document.querySelector('#fields');

function showCandidates(data) {
  const table = fields.querySelector('tbody');
  table.replaceChildren();
  for (const [field, label] of [['number', 'Số, ký hiệu'], ['date', 'Ngày ban hành']]) {
    const entry = data.fields[field];
    const names = {pdf: 'Lớp chữ PDF', native: 'Tesseract', 'native-contrast': 'Tesseract tăng tương phản', vietocr: 'VietOCR'};
    const evidence = Object.entries(entry.candidates).map(([value, sources]) =>
      value + ' (' + [...new Set(sources.map(source => names[source.source] || source.engine))].join(', ') + ')');
    const state = entry.status === 'conflict' ? 'Có xung đột' : entry.value || 'Chưa có gợi ý';
    const row = table.insertRow();
    for (const cell of [label, state, evidence.join(' · ')]) row.insertCell().textContent = cell;
  }
  fields.hidden = false;
}
if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
  button.disabled = true;
  status.textContent = 'Mở đường dẫn phiên do chương trình cục bộ cung cấp.';
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const file = form.querySelector('input').files[0];
  if (!file || file.size > 20 * 1024 * 1024) {
    status.textContent = 'Chọn một PDF tối đa 20 MiB.';
    return;
  }
  button.disabled = true;
  result.textContent = '';
  fields.hidden = true;
  status.textContent = 'Đang đọc trên máy này…';
  try {
    const response = await fetch('./recognize', {
      method: 'POST',
      headers: {'Content-Type': 'application/pdf', Authorization: 'Bearer ' + token},
      body: file,
      redirect: 'error',
      cache: 'no-store'
    });
    if (!response.ok) throw Error(String(response.status));
    const data = await response.json();
    result.textContent = JSON.stringify(data, null, 2);
    showCandidates(data);
    status.textContent = 'Đã đọc vùng đầu trang. Đối chiếu kết quả với PDF gốc.';
  } catch {
    status.textContent = 'Không đọc được PDF. Kiểm tra chương trình cục bộ và mở lại đường dẫn phiên.';
  } finally {
    button.disabled = false;
  }
});
