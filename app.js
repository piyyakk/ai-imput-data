let rows = [];
let busy = false;
let apiKey = localStorage.getItem('po_api_key') || '';

document.addEventListener('DOMContentLoaded', () => {
  injectApiKeyBanner();
  renderTable();
});

function injectApiKeyBanner() {
  const chatPanel = document.querySelector('.chat-panel');
  const banner = document.createElement('div');
  banner.className = 'api-banner';
  banner.id = 'apiBanner';
  banner.innerHTML = `
    <span>🔑</span>
    <input type="password" id="apiKeyInput" placeholder="Masukkan Anthropic API Key..." value="${apiKey}" />
    <button onclick="saveApiKey()">Simpan</button>
  `;
  chatPanel.insertBefore(banner, chatPanel.querySelector('.templates'));
  if (apiKey) hideBanner();
}

function saveApiKey() {
  const val = document.getElementById('apiKeyInput').value.trim();
  if (!val) { showToast('API key tidak boleh kosong'); return; }
  apiKey = val;
  localStorage.setItem('po_api_key', val);
  hideBanner();
  showToast('API key tersimpan!');
}

function hideBanner() {
  const b = document.getElementById('apiBanner');
  if (b) b.style.display = 'none';
}

function tpl(text) {
  document.getElementById('userInput').value = text;
  document.getElementById('userInput').focus();
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function addMsg(role, html) {
  const area = document.getElementById('chatArea');
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  const lbl = role === 'ai' ? 'AI' : 'Sy';
  const cls = role === 'ai' ? 'ai-av' : 'usr-av';
  div.innerHTML = `<div class="av ${cls}">${lbl}</div><div class="bbl">${html}</div>`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function addLoader() {
  const area = document.getElementById('chatArea');
  const div = document.createElement('div');
  div.className = 'msg ai';
  div.id = 'loadingMsg';
  div.innerHTML = `<div class="av ai-av">AI</div><div class="bbl"><span class="spin"></span> Memproses...</div>`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function removeLoader() {
  document.getElementById('loadingMsg')?.remove();
}

async function sendMessage() {
  const input = document.getElementById('userInput');
  const text = input.value.trim();
  if (!text || busy) return;

  if (!apiKey) {
    showToast('Masukkan API key Anthropic dulu');
    document.getElementById('apiBanner').style.display = 'flex';
    return;
  }

  busy = true;
  input.value = '';
  document.getElementById('sendBtn').disabled = true;

  addMsg('user', text);
  addLoader();

  const existingData = rows.length
    ? `\nData PO sudah ada (${rows.length} baris):\n${JSON.stringify(rows)}`
    : '';

  const systemPrompt = `Kamu adalah asisten input data PO (Purchase Order) untuk perusahaan Trakindo. Bahasa Indonesia.
Tugasmu: ekstrak data PO dari pesan dan kembalikan JSON saja, tanpa teks lain, tanpa backtick.

Format response WAJIB:
{
  "status": "ok",
  "entry": {
    "no_po": "nomor PO (angka saja)",
    "deskripsi": "deskripsi lengkap barang/jasa",
    "qty": angka,
    "nilai_po": angka (tanpa titik/koma, dalam rupiah),
    "cabang": "nama cabang",
    "vendor": "nama vendor jika ada",
    "note": "catatan tambahan jika ada"
  },
  "reply": "konfirmasi singkat bahasa Indonesia"
}

Jika pesan bukan input data PO:
{"status":"chat","reply":"jawaban singkat bahasa Indonesia"}

Nilai PO: konversi "juta" x1.000.000, "ribu" x1.000. Simpan sebagai angka bulat.
${existingData}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: 'user', content: text }],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'API error');
    }

    const data = await res.json();
    const raw = data.content.map(c => c.text || '').join('');
    let parsed;
    try { parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()); }
    catch { parsed = { status: 'chat', reply: raw }; }

    removeLoader();

    if (parsed.status === 'ok' && parsed.entry) {
      rows.push(parsed.entry);
      renderTable();
      addMsg('ai', '✓ ' + parsed.reply);
      showToast('Data PO berhasil ditambahkan');
    } else {
      addMsg('ai', parsed.reply || 'Tidak bisa memproses, coba ulangi.');
    }
  } catch (err) {
    removeLoader();
    addMsg('ai', `Gagal: ${err.message}`);
  }

  busy = false;
  document.getElementById('sendBtn').disabled = false;
  input.focus();
}

function fmtRp(n) {
  if (!n && n !== 0) return '-';
  const num = parseInt(String(n).replace(/\D/g, ''));
  if (isNaN(num)) return n;
  return num.toLocaleString('id-ID');
}

function renderTable() {
  const tbody = document.getElementById('tableBody');
  document.getElementById('countBadge').textContent = rows.length + ' data';

  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Belum ada data PO. Mulai input lewat chat.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r, i) => `
    <tr>
      <td class="no-col">${i + 1}</td>
      <td class="po-col">${r.no_po || '-'}</td>
      <td class="deskripsi-col">${r.deskripsi || '-'}</td>
      <td style="text-align:center;">${r.qty || '-'}</td>
      <td class="nilai-col">${fmtRp(r.nilai_po)}</td>
      <td style="white-space:nowrap;font-size:12px;">${r.cabang || '-'}</td>
      <td style="font-size:12px;">${r.vendor || '-'}</td>
      <td style="color:#5a6278;font-size:11px;">${r.note || ''}</td>
    </tr>
  `).join('');
}

function undoLast() {
  if (!rows.length) { showToast('Tidak ada data untuk dibatalkan'); return; }
  rows.pop();
  renderTable();
  showToast('Data terakhir dibatalkan');
}

function clearAll() {
  if (!rows.length) return;
  if (!confirm('Hapus semua data PO?')) return;
  rows = [];
  renderTable();
  showToast('Semua data dihapus');
}

function copyTable() {
  if (!rows.length) { showToast('Tidak ada data'); return; }
  const header = 'No\tNo PO\tDeskripsi\tQty\tNilai PO\tCabang\tVendor\tNote';
  const body = rows.map((r, i) =>
    [i + 1, r.no_po, r.deskripsi, r.qty, r.nilai_po, r.cabang, r.vendor, r.note || ''].join('\t')
  ).join('\n');
  navigator.clipboard.writeText(header + '\n' + body)
    .then(() => showToast('Tabel disalin! Paste langsung ke Excel.'));
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}