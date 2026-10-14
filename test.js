
const analyzeBtn = document.getElementById('analyzeBtn');
const ocrBtn = document.getElementById('ocrBtn');
const sampleBtn = document.getElementById('sampleBtn');
const saveReportBtn = document.getElementById('saveReportBtn');
const exportBtn = document.getElementById('exportBtn');
const messageInput = document.getElementById('messageInput');
const resultBox = document.getElementById('resultBox');
const status = document.getElementById('status');
const imageInput = document.getElementById('imageInput');
const thumb = document.getElementById('thumb');
const reportsList = document.getElementById('reportsList');
const reportsCount = document.getElementById('reportsCount');

let lastAnalysis = null;
let currentImageDataUrl = null;

sampleBtn.addEventListener('click', () => {
  messageInput.value = "URGENT !!! Votre compte a été bloqué. Cliquez ici maintenant pour vérifier vos informations. Vous devez payer 1500 FCFA avant 10 minutes.";
});

imageInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    currentImageDataUrl = reader.result;
    thumb.src = reader.result;
    thumb.style.display = 'block';
  };
  reader.readAsDataURL(file);
});

ocrBtn.addEventListener('click', async () => {
  const file = imageInput.files && imageInput.files[0];
  if (!file) {
    alert('Tu dois choisir une image d’abord.');
    return;
  }

  try {
    setStatus('OCR en cours...');
    const worker = Tesseract.createWorker({
      logger: m => {
        if (m.status === 'recognizing text') {
          setStatus(`OCR : ${Math.round(m.progress * 100)}%`);
        }
      }
    });
    await worker.load();
    try {
      await worker.loadLanguage('fra');
      await worker.initialize('fra');
    } catch {
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
    }
    const { data } = await worker.recognize(file);
    await worker.terminate();
    messageInput.value = (data.text || '').trim();
    setStatus('OCR terminé');
  } catch (err) {
    console.error(err);
    setStatus('Erreur OCR');
    alert('Échec de l’OCR.');
  } finally {
    setTimeout(() => setStatus(''), 1200);
  }
});

analyzeBtn.addEventListener('click', async () => {
  const message = messageInput.value.trim();
  if (!message) {
    resultBox.innerHTML = '<div>Veuillez entrer un message à analyser.</div>';
    return;
  }

  analyzeBtn.disabled = true;
  setStatus('Analyse en cours...');

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Erreur serveur');
    }

    const data = await res.json();
    lastAnalysis = {
      message: data.message,
      score: data.score,
      verdict: data.verdict,
      tip: data.tip,
      ts: new Date().toISOString(),
      source: currentImageDataUrl ? 'image' : 'text',
      image: currentImageDataUrl || null
    };

    renderResult(data);
  } catch (err) {
    console.error(err);
    resultBox.innerHTML = '<div>Erreur lors de l’analyse. Vérifie le backend.</div>';
  } finally {
    analyzeBtn.disabled = false;
    setStatus('');
  }
});

saveReportBtn.addEventListener('click', () => {
  if (!lastAnalysis) {
    alert('Aucune analyse à enregistrer.');
    return;
  }

  const reports = loadReports();
  reports.unshift({ id: cryptoId(), ...lastAnalysis, feedback: null });
  saveReports(reports);
  renderReports();
  alert('Signalement enregistré localement.');
});

exportBtn.addEventListener('click', () => {
  const reports = loadReports();
  if (!reports.length) {
    alert('Aucun signalement à exporter.');
    return;
  }

  const rows = [];
  rows.push(['id', 'ts', 'source', 'score', 'verdict', 'tip', 'message', 'feedback'].join(','));
  for (const r of reports) {
    rows.push([
      '"' + (r.id || '').replace(/"/g, '""') + '"',
      '"' + (r.ts || '').replace(/"/g, '""') + '"',
      '"' + (r.source || '').replace(/"/g, '""') + '"',
      '"' + String(r.score || '').replace(/"/g, '""') + '"',
      '"' + (r.verdict || '').replace(/"/g, '""') + '"',
      '"' + (r.tip || '').replace(/"/g, '""') + '"',
      '"' + (r.message || '').replace(/"/g, '""') + '"',
      '"' + (r.feedback || '').replace(/"/g, '""') + '"'
    ].join(','));
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'idetector_reports.csv';
  a.click();
  URL.revokeObjectURL(url);
});

function renderResult(data) {
  let color = '#16a34a';
  if (data.score >= 70) color = '#dc2626';
  else if (data.score >= 40) color = '#f59e0b';

  resultBox.innerHTML = `
    <div class="score" style="color:${color}">Score : ${data.score}/100</div>
    <div class="verdict">${data.verdict}</div>
    <div class="tip">${data.tip}</div>
    <div class="meta" style="margin-top:10px;">Message analysé :</div>
    <div style="white-space:pre-wrap; margin-top:8px;">${escapeHtml(data.message)}</div>
  `;
}

function renderReports() {
  const reports = loadReports();
  reportsCount.textContent = `${reports.length} signalements`;

  reportsList.innerHTML = '';
  for (const r of reports) {
    const card = document.createElement('div');
    card.className = 'report';

    card.innerHTML = `
      <div class="report-head">
        <span>${new Date(r.ts).toLocaleString()}</span>
        <span>score ${r.score}</span>
      </div>
      <div class="report-text">${escapeHtml(shorten(r.message, 220))}</div>
      <div class="report-actions">
        <button class="small-btn good" data-id="${r.id}">Correct</button>
        <button class="small-btn bad" data-id="${r.id}">Incorrect</button>
        <button class="small-btn delete" data-id="${r.id}">Supprimer</button>
      </div>
      <div class="meta">${r.feedback ? 'Feedback : ' + r.feedback : 'Aucun feedback'}</div>
    `;

    reportsList.appendChild(card);
  }

  setReportHandlers();
}

function setReportHandlers() {
  document.querySelectorAll('.good').forEach(btn => {
    btn.onclick = () => setFeedback(btn.dataset.id, 'correct');
  });
  document.querySelectorAll('.bad').forEach(btn => {
    btn.onclick = () => setFeedback(btn.dataset.id, 'incorrect');
  });
  document.querySelectorAll('.delete').forEach(btn => {
    btn.onclick = () => {
      if (confirm('Supprimer ce signalement ?')) {
        deleteReport(btn.dataset.id);
      }
    };
  });
}

function setFeedback(id, feedback) {
  const reports = loadReports().map(r => r.id === id ? { ...r, feedback } : r);
  saveReports(reports);
  renderReports();
}

function deleteReport(id) {
  const reports = loadReports().filter(r => r.id !== id);
  saveReports(reports);
  renderReports();
}

function loadReports() {
  try {
    return JSON.parse(localStorage.getItem('idetector_reports') || '[]');
  } catch {
    return [];
  }
}

function saveReports(reports) {
  localStorage.setItem('idetector_reports', JSON.stringify(reports));
}

function shorten(str, n) {
  return str.length > n ? str.slice(0, n - 15) + '...' : str;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function cryptoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

renderReports();
