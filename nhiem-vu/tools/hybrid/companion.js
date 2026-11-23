const token = location.hash.slice(1);
history.replaceState(null, '', '/');
const form = document.querySelector('#ocr');
const status = document.querySelector('#status');
const result = document.querySelector('#result');
const button = form.querySelector('button');
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
    result.textContent = JSON.stringify(await response.json(), null, 2);
    status.textContent = 'Đã đọc vùng đầu trang. Đối chiếu kết quả với PDF gốc.';
  } catch {
    status.textContent = 'Không đọc được PDF. Kiểm tra chương trình cục bộ và mở lại đường dẫn phiên.';
  } finally {
    button.disabled = false;
  }
});
