'use strict';

const STORAGE_KEY = 'oboeru-kun-v1';
const $ = id => document.getElementById(id);
let state = { people: [], queue: [], mastered: [], history: [] };
let editingId = null;
let pendingDelete = null;
let revealed = false;
let drag = null;
let busy = false;

function normalizeState(data) {
  if (!data || !Array.isArray(data.people)) return state;
  const seen = new Set();
  const people = data.people.filter(person => {
    if (!person || typeof person.id !== 'string' || seen.has(person.id) || typeof person.nickname !== 'string' || typeof person.name !== 'string' || !person.nickname.trim() || !person.name.trim()) return false;
    seen.add(person.id);
    return true;
  }).map(person => ({ id: person.id, nickname: person.nickname.slice(0, 60), name: person.name.slice(0, 100) }));
  const mastered = [...new Set(Array.isArray(data.mastered) ? data.mastered : [])].filter(id => seen.has(id));
  const queue = [...new Set(Array.isArray(data.queue) ? data.queue : [])].filter(id => seen.has(id) && !mastered.includes(id));
  people.forEach(person => { if (!mastered.includes(person.id) && !queue.includes(person.id)) queue.push(person.id); });
  return { people, queue, mastered, history: [] };
}

try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) state = normalizeState(JSON.parse(stored));
} catch {
  $('storage-warning').textContent = '保存データを読み込めませんでした。この画面では新しく登録して練習できます。';
  $('storage-warning').hidden = false;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, history: [] }));
    $('storage-warning').hidden = true;
  } catch {
    $('storage-warning').textContent = 'このブラウザでは保存できません。データは画面を閉じると失われます。';
    $('storage-warning').hidden = false;
  }
}

function render() {
  revealed = false;
  $('people-count').textContent = state.people.length;
  $('total-count').textContent = state.people.length;
  $('mastered-count').textContent = state.mastered.length;
  $('progress-fill').style.width = `${state.people.length ? state.mastered.length / state.people.length * 100 : 0}%`;
  const person = state.people.find(person => person.id === state.queue[0]);
  const empty = state.people.length === 0;
  $('empty-state').hidden = !empty;
  $('complete-state').hidden = empty || !!person;
  $('flashcard').hidden = !person;
  document.querySelector('.card-shadow').hidden = !person;
  $('practice-controls').hidden = !person;
  document.querySelector('.practice-bottom').hidden = !person;
  $('restart').disabled = empty;
  $('undo').hidden = !state.history.length;
  $('answer').hidden = true;
  $('tap-hint').hidden = false;
  $('revealed-hint').hidden = true;
  $('remembered').disabled = true;
  $('forgot').disabled = true;
  if (person) {
    $('card-nickname').textContent = person.nickname;
    $('card-name').textContent = person.name;
    $('card-position').textContent = `NAME CARD / 残り ${state.queue.length} 人`;
    $('flashcard').setAttribute('aria-label', `${person.nickname}。タップして本名を見る`);
  }
  $('complete-message').textContent = `${state.people.length}人の名前を覚えました。次に会うのが楽しみですね。`;
  renderPeople();
}

function renderPeople() {
  const list = $('people-list');
  list.replaceChildren();
  if (!state.people.length) {
    const empty = document.createElement('p');
    empty.className = 'list-empty';
    empty.textContent = 'まだ登録がありません。「人を登録する」からはじめよう。';
    list.append(empty);
  }
  for (const person of state.people) {
    const row = document.createElement('div');
    row.className = 'person-row';
    const avatar = document.createElement('span');
    avatar.className = 'person-avatar';
    avatar.textContent = Array.from(person.nickname)[0];
    const names = document.createElement('div');
    names.className = 'person-names';
    const nickname = document.createElement('strong');
    nickname.textContent = person.nickname;
    const name = document.createElement('small');
    name.textContent = person.name;
    names.append(nickname, name);
    const status = document.createElement('span');
    status.className = 'person-status';
    status.textContent = state.mastered.includes(person.id) ? '✓ おぼえた' : '練習中';
    const edit = document.createElement('button');
    edit.className = 'text-button';
    edit.textContent = '編集';
    edit.setAttribute('aria-label', `${person.nickname}を編集`);
    edit.addEventListener('click', () => openPerson(person));
    const remove = document.createElement('button');
    remove.className = 'text-button danger';
    remove.textContent = '削除';
    remove.setAttribute('aria-label', `${person.nickname}を削除`);
    remove.addEventListener('click', () => confirmDeletion(person));
    row.append(avatar, names, status, edit, remove);
    list.append(row);
  }
  $('delete-all').disabled = !state.people.length;
}

function selectTab(which) {
  const practice = which === 'practice';
  $('practice-panel').hidden = !practice;
  $('people-panel').hidden = practice;
  $('practice-tab').classList.toggle('active', practice);
  $('people-tab').classList.toggle('active', !practice);
  $('practice-tab').setAttribute('aria-selected', String(practice));
  $('people-tab').setAttribute('aria-selected', String(!practice));
}

function reveal() {
  if (!state.queue.length || busy) return;
  revealed = true;
  $('answer').hidden = false;
  $('tap-hint').hidden = true;
  $('revealed-hint').hidden = false;
  $('remembered').disabled = false;
  $('forgot').disabled = false;
  $('flashcard').setAttribute('aria-label', `${$('card-nickname').textContent}の本名は${$('card-name').textContent}。左右のキーかスワイプで回答`);
}

function decide(remembered) {
  if (!revealed || busy || !state.queue.length) return;
  state.history.push({ queue: [...state.queue], mastered: [...state.mastered] });
  if (state.history.length > 100) state.history.shift();
  const id = state.queue.shift();
  const person = state.people.find(person => person.id === id);
  if (remembered) state.mastered.push(id);
  else state.queue.push(id);
  $('session-note').textContent = remembered ? `${person.nickname}、おぼえた！` : state.queue.length === 1 ? 'あとひとり。もう一度、思い出してみよう。' : `${person.nickname}は、あとでもう一度。`;
  save();
  render();
}

function restart() {
  state.queue = state.people.map(person => person.id);
  state.mastered = [];
  state.history = [];
  $('session-note').textContent = '';
  save();
  render();
}

function openPerson(person = null) {
  editingId = person?.id || null;
  $('person-form').reset();
  $('nickname-input').value = person?.nickname || '';
  $('name-input').value = person?.name || '';
  $('dialog-title').textContent = person ? '登録した名前を編集' : '覚えたい人を登録';
  $('dialog-eyebrow').textContent = person ? 'EDIT A PERSON' : 'ADD A NEW PERSON';
  document.querySelector('.submit-button').textContent = person ? '変更を保存する' : '登録する ＋';
  $('form-error').textContent = '';
  $('person-dialog').showModal();
  $('nickname-input').focus();
}

function confirmDeletion(person = null) {
  pendingDelete = person?.id || 'all';
  $('confirm-description').textContent = person ? `「${person.nickname}」の登録を削除します。この操作は元に戻せません。` : '登録した全員の名前と練習の進み具合を、このブラウザから削除します。この操作は元に戻せません。';
  $('confirm-dialog').showModal();
  $('cancel-delete').focus();
}

$('person-form').addEventListener('submit', event => {
  event.preventDefault();
  const nickname = $('nickname-input').value.trim();
  const name = $('name-input').value.trim();
  if (!nickname || !name) {
    $('form-error').textContent = 'ニックネームと本名を入力してください。';
    return;
  }
  if (editingId) {
    const person = state.people.find(person => person.id === editingId);
    Object.assign(person, { nickname, name });
    state.mastered = state.mastered.filter(id => id !== editingId);
    if (!state.queue.includes(editingId)) state.queue.push(editingId);
  } else {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    state.people.push({ id, nickname, name });
    state.queue.push(id);
  }
  state.history = [];
  $('session-note').textContent = editingId ? '名前を更新しました。もう一度練習してみよう。' : `${nickname}を登録しました。`;
  save();
  render();
  $('person-dialog').close();
});

$('confirm-delete').addEventListener('click', () => {
  if (pendingDelete === 'all') {
    state = { people: [], queue: [], mastered: [], history: [] };
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* No persisted data is available. */ }
  } else {
    state.people = state.people.filter(person => person.id !== pendingDelete);
    state.queue = state.queue.filter(id => id !== pendingDelete);
    state.mastered = state.mastered.filter(id => id !== pendingDelete);
    state.history = [];
    save();
  }
  $('session-note').textContent = 'データを削除しました。';
  pendingDelete = null;
  render();
  $('confirm-dialog').close();
});

$('practice-tab').addEventListener('click', () => selectTab('practice'));
$('people-tab').addEventListener('click', () => selectTab('people'));
$('empty-add').addEventListener('click', () => openPerson());
$('add-person').addEventListener('click', () => openPerson());
$('close-dialog').addEventListener('click', () => $('person-dialog').close());
$('cancel-delete').addEventListener('click', () => $('confirm-dialog').close());
$('delete-all').addEventListener('click', () => confirmDeletion());
$('flashcard').addEventListener('click', reveal);
$('forgot').addEventListener('click', () => decide(false));
$('remembered').addEventListener('click', () => decide(true));
$('restart').addEventListener('click', restart);
$('practice-again').addEventListener('click', restart);
$('undo').addEventListener('click', () => {
  const previous = state.history.pop();
  if (!previous) return;
  state.queue = previous.queue;
  state.mastered = previous.mastered;
  $('session-note').textContent = 'ひとつ前のカードに戻りました。';
  save();
  render();
});
$('load-demo').addEventListener('click', () => {
  state.people = [
    { id: 'sample-1', nickname: 'たっちゃん', name: '田中 達也' },
    { id: 'sample-2', nickname: 'みーちゃん', name: '佐藤 美咲' },
    { id: 'sample-3', nickname: 'けんけん', name: '鈴木 健太' },
  ];
  restart();
  $('session-note').textContent = '架空の3人です。タップして本名を見てみよう。';
});

document.addEventListener('keydown', event => {
  if ($('person-dialog').open || $('confirm-dialog').open || $('practice-panel').hidden || /INPUT|TEXTAREA/.test(event.target.tagName) || (event.target.tagName === 'BUTTON' && event.target !== $('flashcard'))) return;
  if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); reveal(); }
  if (event.key === 'ArrowLeft') { event.preventDefault(); decide(false); }
  if (event.key === 'ArrowRight') { event.preventDefault(); decide(true); }
});

const card = $('flashcard');
card.addEventListener('pointerdown', event => {
  if (!revealed || busy || event.button !== 0) return;
  drag = { x: event.clientX, y: event.clientY, id: event.pointerId };
});
card.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (Math.abs(dy) > Math.abs(dx) && Math.abs(dx) < 12) { resetDrag(); return; }
  if (Math.abs(dx) > 10 && !card.hasPointerCapture(event.pointerId)) card.setPointerCapture(event.pointerId);
  card.style.transform = `translateX(${dx * .65}px) rotate(${dx * .035}deg)`;
  $('swipe-label').textContent = dx > 0 ? 'おぼえた！' : 'もう一度';
  $('swipe-label').style.color = dx > 0 ? '#5c8746' : '#bc8057';
  $('swipe-label').style.opacity = Math.min(Math.abs(dx) / 100, 1);
});
function resetDrag() {
  card.style.transform = '';
  $('swipe-label').style.opacity = 0;
  drag = null;
}
card.addEventListener('pointerup', event => {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (card.hasPointerCapture(event.pointerId)) card.releasePointerCapture(event.pointerId);
  resetDrag();
  if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy)) {
    decide(dx > 0);
    // The click synthesized after a swipe must not reveal the next card.
    busy = true;
    setTimeout(() => { busy = false; }, 100);
  }
});
card.addEventListener('pointercancel', resetDrag);
window.addEventListener('blur', resetDrag);
render();
