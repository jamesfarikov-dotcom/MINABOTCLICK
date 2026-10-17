const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); tg.setHeaderColor?.('#10231d'); tg.setBackgroundColor?.('#091713'); }

const $ = (id) => document.getElementById(id);
let player = null;
let tasks = [];
let nextUpgradeCost = 50;
let busy = false;
let noticeTimer;

function showNotice(message) {
  const n = $('notice');
  n.textContent = message;
  n.classList.add('show');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => n.classList.remove('show'), 2800);
}

function formatNumber(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value || 0));
}

async function api(path, options = {}) {
  const initData = tg?.initData || '';
  if (!initData) throw new Error('Открой Mini App через Telegram-бота, а не обычной вкладкой браузера.');
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Ошибка сервера (${response.status}).`);
  return data;
}

function renderPlayer() {
  if (!player) return;
  $('coins').textContent = formatNumber(player.coins);
  $('power').textContent = formatNumber(player.tapPower);
  $('tap-gain').textContent = formatNumber(player.tapPower);
  $('energy').textContent = formatNumber(player.energy);
  $('energy-bar').style.width = `${Math.max(0, Math.min(100, player.energy / player.maxEnergy * 100))}%`;
  $('level').textContent = String(player.upgradeLevel + 1);
  $('upgrade-cost').textContent = formatNumber(nextUpgradeCost);
}

function renderTasks() {
  const host = $('tasks');
  if (!tasks.length) { host.innerHTML = '<div class="task-row">Пока нет заданий.</div>'; return; }
  host.innerHTML = tasks.map(t => `
    <div class="task-row">
      <div class="task-icon">${t.id === 'daily' ? '🎁' : '🛡️'}</div>
      <div class="task-copy"><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.description)}</span></div>
      <div class="task-reward">+${formatNumber(t.reward)} 🪙</div>
      <button class="claim-button" data-claim="${t.id}" ${t.available ? '' : 'disabled'}>${t.available ? 'Забрать' : 'Недоступно'}</button>
    </div>`).join('');
  host.querySelectorAll('[data-claim]').forEach(btn => btn.addEventListener('click', () => claimTask(btn.dataset.claim)));
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function refresh() {
  const data = await api('/api/me');
  player = data.player;
  tasks = data.tasks || [];
  nextUpgradeCost = Math.floor(50 * Math.pow(2, player.upgradeLevel));
  renderPlayer();
  renderTasks();
}

async function tap(event) {
  if (busy) return;
  busy = true;
  try {
    const data = await api('/api/tap', { method: 'POST', body: '{}' });
    player = data.player;
    renderPlayer();
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    const x = event?.clientX ?? window.innerWidth / 2;
    const y = event?.clientY ?? window.innerHeight / 2;
    const float = document.createElement('div');
    float.className = 'float-coin';
    float.textContent = `+${player.tapPower} 🪙`;
    float.style.left = `${Math.min(window.innerWidth - 90, Math.max(10, x - 25))}px`;
    float.style.top = `${Math.max(30, y - 10)}px`;
    document.body.appendChild(float);
    setTimeout(() => float.remove(), 700);
  } catch (e) { showNotice(e.message); }
  finally { busy = false; }
}

async function upgrade() {
  try {
    const data = await api('/api/upgrade', { method: 'POST', body: '{}' });
    player = data.player;
    nextUpgradeCost = data.nextUpgradeCost || Math.floor(50 * Math.pow(2, player.upgradeLevel));
    renderPlayer();
    showNotice('Кирка улучшена! Сила тапа увеличена.');
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
  } catch (e) { showNotice(e.message); }
}

async function claimTask(taskId) {
  try {
    const data = await api('/api/tasks/claim', { method: 'POST', body: JSON.stringify({ taskId }) });
    player = data.player;
    await refresh();
    showNotice(data.message || 'Награда получена!');
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
  } catch (e) { showNotice(e.message); }
}

async function shareReferral() {
  try {
    const data = await api('/api/referral');
    if (!data.link) { showNotice(data.note || 'Добавь BOT_USERNAME в настройки сервера.'); return; }
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(data.link)}&text=${encodeURIComponent('Заходи в мою гильдию Goblin Empire!')}`);
    } else if (navigator.share) {
      await navigator.share({ title: 'Goblin Empire', text: 'Заходи в мою гильдию!', url: data.link });
    } else {
      await navigator.clipboard.writeText(data.link);
      showNotice('Реферальная ссылка скопирована.');
    }
    $('ref-note').textContent = `Приглашено игроков: ${data.referrals}`;
  } catch (e) { showNotice(e.message); }
}

$('crystal').addEventListener('click', tap);
$('upgrade').addEventListener('click', upgrade);
$('share').addEventListener('click', shareReferral);
document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b === btn));
  const tab = btn.dataset.tab;
  if (tab === 'tasks') $('upgrade-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if (tab === 'friends') $('share').scrollIntoView({ behavior: 'smooth', block: 'center' });
  else if (tab === 'wallet') showNotice('TON-кошелёк пока не подключён. Монеты сейчас игровые, не криптовалюта.');
  else window.scrollTo({ top: 0, behavior: 'smooth' });
}));

refresh().catch(e => {
  showNotice(e.message);
  $('tasks').innerHTML = '<div class="task-row">Проверь BOT_TOKEN, DATABASE_URL и открой игру из Telegram.</div>';
});
