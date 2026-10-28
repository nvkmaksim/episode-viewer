'use strict';
// Standalone read-only player of an annotated episode (data made by `manage.py export_viewer`).
// No build step, no libraries: video + a canvas laid over it, the layers chosen in the menu at the top left.

const OBJECT_COLORS = ['#ff4d4f', '#1677ff', '#52c41a', '#faad14', '#722ed1', '#13c2c2', '#eb2f96'];
const FINGERS = [
  { color: '#f5222d', points: [0, 1, 2, 3, 4] }, { color: '#fa8c16', points: [0, 5, 6, 7, 8] },
  { color: '#52c41a', points: [0, 9, 10, 11, 12] }, { color: '#1677ff', points: [0, 13, 14, 15, 16] },
  { color: '#722ed1', points: [0, 17, 18, 19, 20] },
];
const HAND_COLORS = { left: '#1890ff', right: '#fa8c16' };
const INTERACTIONS = {
  grasping: ['Захват', '#ff4d4f', 'Grasping'], holding: ['Удержание', '#fa8c16', 'Holding'], touching: ['Касание', '#52c41a', 'Touching'],
  releasing: ['Отпускание', '#1890ff', 'Releasing'], placing: ['Размещение', '#13c2c2', 'Placing'], pushing: ['Толкание', '#722ed1', 'Pushing'],
  pulling: ['Тяга', '#eb2f96', 'Pulling'], approaching: ['Приближение', '#8c8c8c', 'Approaching'], near: ['Рядом', '#8c8c8c', 'Near'],
  inside: ['Внутри', '#8c8c8c', 'Inside'], above: ['Над', '#8c8c8c', 'Above'], below: ['Под', '#8c8c8c', 'Below'], unknown: ['?', '#bfbfbf', '?'],
};
const STATE_TEXT = {
  open_closed: { ru: ['Открыт / закрыт', { open: 'открыт', closed: 'закрыт', ajar: 'приоткрыт' }], en: ['Open / closed', { open: 'open', closed: 'closed', ajar: 'ajar' }] },
  filled_empty: { ru: ['Заполненность', { empty: 'пустой', partially_filled: 'частично заполнен', full: 'полный' }], en: ['Fill level', { empty: 'empty', partially_filled: 'partly filled', full: 'full' }] },
  on_off: { ru: ['Включён / выключен', { on: 'включён', off: 'выключен' }], en: ['On / off', { on: 'on', off: 'off' }] },
  location: { ru: ['Где находится', { in_hand: 'в руке', in_basket: 'в корзине', in_drum: 'в барабане', on_table: 'на столе', on_floor: 'на полу' }], en: ['Location', { in_hand: 'in hand', in_basket: 'in basket', in_drum: 'in drum', on_table: 'on table', on_floor: 'on floor' }] },
  folded_unfolded: { ru: ['Сложен / развёрнут', { folded: 'сложен', unfolded: 'развёрнут', partially_folded: 'частично сложен' }], en: ['Folded / unfolded', { folded: 'folded', unfolded: 'unfolded', partially_folded: 'partly folded' }] },
  clean_dirty: { ru: ['Чистый / грязный', { clean: 'чистый', dirty: 'грязный', wet: 'мокрый' }], en: ['Clean / dirty', { clean: 'clean', dirty: 'dirty', wet: 'wet' }] },
};
// action names come from the data in Russian; the English view maps the known ones and leaves the rest as is
const ACTION_EN = {
  'Стирка белья': 'Doing laundry',
  'Открыть стиральную машину': 'Open the washing machine',
  'Положить бельё в стиральную машину': 'Put laundry into the washing machine',
  'Закрыть стиральную машину': 'Close the washing machine',
  'Заполнить стиральную машину средство для стирки': 'Add detergent to the washing machine',
  'Запустить стиральную машину': 'Start the washing machine',
  'Взяться за дверцу': 'Grab the door',
  'Открыть дверцу': 'Open the door',
  'Закрыть дверцу': 'Close the door',
  'Взять бельё с пола': 'Pick up laundry from the floor',
  'Положить бельё в барабан': 'Put laundry into the drum',
  'Собрать простыню в охапку': 'Gather the sheet into a bundle',
  'Положить простыню в барабан': 'Put the sheet into the drum',
  'Взять вещи из таза': 'Take items from the basket',
  'Взять полотенце из таза': 'Take a towel from the basket',
  'Положить полотенце в барабан': 'Put the towel into the drum',
  'Положить вещи в барабан': 'Put items into the drum',
  'Выдвинуть лоток для порошка': 'Pull out the detergent drawer',
  'Взять упаковку порошка': 'Pick up the detergent pack',
  'Насыпать порошок в лоток': 'Pour detergent into the drawer',
  'Задвинуть лоток': 'Push the drawer back in',
  'Нажать кнопку запуска': 'Press the start button',
};
const LEVEL_NAMES = ['Task', 'Subtask', 'Atomic action'];
const LEVEL_COLORS = ['#4c9aff', '#36cfc9', '#ffc53d'];
const LAYER_KEYS = ['boxes', 'masks', 'trajectories', 'hand2d', 'hand3d', 'depth', 'interactions', 'states', 'subtitles'];

// ---------------------------------------------------------------- language (ru / en)
const I18N = {
  ru: {
    pageTitle: 'Стирка белья: размеченный эпизод от первого лица', heading: 'Стирка белья: размеченный эпизод от первого лица',
    note: 'Только просмотр. Часть разметки получена моделями (позы, глубина, камера) и не является измерением.',
    loading: 'Загрузка разметки…', space: 'Пробел', speed: 'Скорость',
    hint: 'Пробел - пауза, ← → - ±1 с, , . - кадр',
    hidePanel: 'Скрыть меню', showPanel: 'Показать меню',
    tabActions: 'Действия', tabScene: 'Сцена 3D', tabInfo: 'О разметке',
    boxes: 'Рамки трекинга', masks: 'Маски', trajectories: 'Траектории', hand2d: 'Поза рук 2D', hand3d: 'Поза рук 3D',
    depth: 'Глубина', interactions: 'Взаимодействия', states: 'Состояния', subtitles: 'Субтитры действий',
    docTitle: (n) => `Разметка: ${n}`,
    videoError: 'Не удалось загрузить видео (video.mp4). Разметка ниже доступна.',
    noData: ' (нет данных)', loadingNote: ' (загрузка…)', objects: 'Объекты', layers: (n) => `Слои (${n}) ▾`,
    noScene: 'Для этого видео сцена 3D не посчитана', now: 'Сейчас', voice: 'Голос', goal: 'Цель', outcome: 'Результат',
    ok: '✓ успешно', fail: '✗ неуспешно', noAction: 'Нет действия в этот момент', noActions: 'Действия не размечены.',
    unverified: 'не проверено', left: 'левая', right: 'правая', none: 'нет', yes: 'есть',
    infoWhat: 'Что в этом видео', duration: 'Длительность', fps: 'кадров/с',
    counts: (a, i, s) => `Действий: ${a} · взаимодействий: ${i} · состояний: ${s}`,
    tracksMasks: (t, m) => `Объектов с треками: ${t} · масок: ${m}`,
    handFrames: (h) => `Поз рук (кадров): ${h}`, depthMaps: (n) => `Карт глубины: ${n}`,
    scene3dLine: (g) => `Сцена 3D: ${g}`, scenesList: (n, list) => `${n} сцен(ы): ${list}`, notComputed: 'не посчитана',
    infoRead: 'Как читать',
    read1: 'Слои выбираются в меню «Слои» в левом верхнем углу видео. Полоски под видео - иерархия действий (Task › Subtask › Atomic action); клик по полоске или по действию справа перематывает видео.',
    read2: 'Взаимодействия со знаком «?» и действия «не проверено» - предложения моделей, которые человек ещё не подтвердил.',
    infoLimits: 'Ограничения',
    limits: (sc) => `Позы рук, глубина и положение камеры - оценки моделей по видео с телефона, а не измерения. Путь камеры рвётся там, где трекинг теряется (например, ткань закрыла весь кадр), поэтому 3D разбито на ${sc.length} сцен(ы), у каждой своя система координат и свой масштаб${sc.length && sc.every((g) => g.scale.method === 'hand_size') ? ' (подогнан по размеру кисти)' : ''}; между сценами их нельзя совмещать. Угол обзора камеры предположен (${sc.length ? sc[0].fov_deg : 65}°). Внутри сцены путь со временем накапливает ошибку.`,
    s3title: 'Сцена 3D', camNow: 'камера сейчас', leftHand: 'левая рука', rightHand: 'правая рука', trail: 'линии - путь за последние 2 с',
    helpOrbit: 'Тяните мышью - вращение, колесо - масштаб, двойной клик - сброс вида. Если комната «двоится», путь камеры и глубина не совпали.',
    helpCamera: 'Сцена так, как её видела камера в этот момент: запустите видео, и облако точек будет двигаться вместе с ним.',
    modeCamera: 'Из камеры', modeOrbit: 'Орбита', modeTop: 'Сверху',
    s3go: 'К началу посчитанного отрезка',
    s3info: (i, n, d, p) => `Сцена ${i} из ${n}: ${d} видео, камера: ${p} поз.`,
    s3cloudFail: ' Облако точек не загрузилось.', outside3d: 'сейчас вне посчитанного отрезка 3D',
    frame: (n) => `кадр ${n}`,
    loadFail: (m) => `Не удалось загрузить разметку: ${m}. Откройте страницу через веб-сервер (start-viewer), а не двойным кликом по файлу.`,
  },
  en: {
    pageTitle: 'Laundry Task: Annotated Egocentric Episode', heading: 'Laundry Task: Annotated Egocentric Episode',
    note: 'View only. Part of the annotations come from models (poses, depth, camera) and are not measurements.',
    loading: 'Loading annotations…', space: 'Space', speed: 'Speed',
    hint: 'Space - pause, ← → - ±1 s, , . - frame',
    hidePanel: 'Hide menu', showPanel: 'Show menu',
    tabActions: 'Actions', tabScene: '3D scene', tabInfo: 'About',
    boxes: 'Tracking boxes', masks: 'Masks', trajectories: 'Trajectories', hand2d: 'Hand pose 2D', hand3d: 'Hand pose 3D',
    depth: 'Depth', interactions: 'Interactions', states: 'States', subtitles: 'Action subtitles',
    docTitle: (n) => `Annotations: ${n}`,
    videoError: 'Could not load the video (video.mp4). The annotations below are still available.',
    noData: ' (no data)', loadingNote: ' (loading…)', objects: 'Objects', layers: (n) => `Layers (${n}) ▾`,
    noScene: 'The 3D scene was not computed for this video', now: 'Now', voice: 'Voice', goal: 'Goal', outcome: 'Outcome',
    ok: '✓ success', fail: '✗ failure', noAction: 'No action at this moment', noActions: 'No actions annotated.',
    unverified: 'unverified', left: 'left', right: 'right', none: 'none', yes: 'yes',
    infoWhat: 'What is in this video', duration: 'Duration', fps: 'fps',
    counts: (a, i, s) => `Actions: ${a} · interactions: ${i} · states: ${s}`,
    tracksMasks: (t, m) => `Objects with tracks: ${t} · masks: ${m}`,
    handFrames: (h) => `Hand poses (frames): ${h}`, depthMaps: (n) => `Depth maps: ${n}`,
    scene3dLine: (g) => `3D scenes: ${g}`, scenesList: (n, list) => `${n} (${list})`, notComputed: 'not computed',
    infoRead: 'How to read',
    read1: 'Pick layers in the “Layers” menu at the top left of the video. The bars under the video are the action hierarchy (Task › Subtask › Atomic action); click a bar or an action on the right to seek the video.',
    read2: 'Interactions marked “?” and actions marked “unverified” are model proposals that a person has not confirmed yet.',
    infoLimits: 'Limitations',
    limits: (sc) => `Hand poses, depth and camera position are model estimates from a phone video, not measurements. The camera path breaks where tracking is lost (for example, cloth fills the whole frame), so the 3D is split into ${sc.length} scene${sc.length === 1 ? '' : 's'}, each with its own coordinate frame and scale${sc.length && sc.every((g) => g.scale.method === 'hand_size') ? ' (fitted to hand size)' : ''}; scenes cannot be overlaid on each other. The camera field of view is assumed (${sc.length ? sc[0].fov_deg : 65}°). Within a scene the path accumulates error over time.`,
    s3title: '3D scene', camNow: 'camera now', leftHand: 'left hand', rightHand: 'right hand', trail: 'lines - path over the last 2 s',
    helpOrbit: 'Drag to rotate, wheel to zoom, double-click to reset the view. If the room looks doubled, the camera path and the depth disagree.',
    helpCamera: 'The scene as the camera saw it at this moment: play the video and the point cloud moves with it.',
    modeCamera: 'Camera view', modeOrbit: 'Orbit', modeTop: 'Top-down',
    s3go: 'Jump to the start of the computed segment',
    s3info: (i, n, d, p) => `Scene ${i} of ${n}: ${d} of video, camera: ${p} poses.`,
    s3cloudFail: ' The point cloud failed to load.', outside3d: 'currently outside the computed 3D segment',
    frame: (n) => `frame ${n}`,
    loadFail: (m) => `Could not load the annotations: ${m}. Open the page through a web server (start-viewer), not by double-clicking the file.`,
  },
};
let lang = 'ru';
try {
  const asked = new URLSearchParams(location.search).get('lang') || localStorage.getItem('lang');
  lang = I18N[asked] ? asked : 'en';
} catch (e) { /* storage blocked: keep the default */ }
const t = (key, ...args) => { const v = I18N[lang][key]; return typeof v === 'function' ? v(...args) : v; };
function applyStaticText() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('#lang button').forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
}

const $ = (id) => document.getElementById(id);
const stateText = (s) => {
  const known = (STATE_TEXT[s.attribute] || {})[lang];
  return `${known ? known[0] : s.attribute}: ${known && known[1][s.value] ? known[1][s.value] : s.value}`;
};
const clock = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) { // gzip; a proxy may already have unpacked it
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return bytes;
}

// index of the entry of a sorted array nearest to `value`, or -1 farther than `tolerance`
function nearest(sorted, value, tolerance) {
  let lo = 0;
  let hi = sorted.length - 1;
  if (hi < 0) return -1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1; else hi = mid;
  }
  let best = lo;
  if (lo > 0 && Math.abs(sorted[lo - 1] - value) <= Math.abs(sorted[lo] - value)) best = lo - 1;
  return Math.abs(sorted[best] - value) <= tolerance ? best : -1;
}

function lowerBound(sorted, value) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1; else hi = mid;
  }
  return lo;
}

async function main() {
  const data = JSON.parse(new TextDecoder().decode(await fetchBytes('data.json.gz')));
  const ep = data.episode;
  const fps = ep.fps;
  const setTitles = () => { document.title = t('pageTitle'); };
  setTitles();
  $('loading').hidden = true;
  $('app').hidden = false;

  const objects = data.objects;
  const colorOf = (id) => OBJECT_COLORS[Math.max(0, objects.findIndex((o) => o.id === id)) % OBJECT_COLORS.length];
  const nameOf = (id) => (objects.find((o) => o.id === id) || {}).name || `#${id}`;
  const actions = data.actions;
  const hasVoice = actions.some((a) => a.voice);
  // the camera path is cut where tracking was lost: every piece is a scene with its own world frame
  const scenes = data.scenes || (data.geometry ? [data.geometry] : []);
  let geometry = scenes[0] || null;     // the scene shown in the 3D tab
  const sceneAt = (frame) => scenes.find((g) => frame >= g.start && frame <= g.end) || null;

  // ---------------------------------------------------------------- state
  const available = {
    boxes: Object.keys(data.tracks).length > 0,
    masks: !!data.masks_file || Object.keys(data.masks || {}).length > 0,
    trajectories: Object.keys(data.tracks).length > 0,
    hand2d: Object.keys(data.hands).length > 0,
    hand3d: Object.values(data.hands).some((h) => h.k3.some((k) => k)),
    depth: !!data.depth,
    interactions: data.relationships.length > 0,
    states: data.states.length > 0,
    subtitles: actions.some((a) => a.level === 2),
  };
  const layers = {
    boxes: available.boxes, masks: false, trajectories: false, hand2d: available.hand2d, hand3d: false, depth: false,
    interactions: available.interactions, states: available.states, subtitles: available.subtitles,
  };
  const hiddenObjects = new Set();
  let dirty = true;

  // ---------------------------------------------------------------- video
  const video = $('video');
  const stage = $('stage');
  const overlay = $('overlay');
  const ctx = overlay.getContext('2d');
  const videoInfo = data.video || { file: 'video.mp4' };
  video.src = videoInfo.file;
  video.addEventListener('error', () => {
    $('video-error').hidden = false;
    $('video-error').textContent = t('videoError');
  });
  // currentTime runs ahead of the picture that is on the screen; the time of the presented frame does not
  let shownTime = null;
  if ('requestVideoFrameCallback' in video) {
    const onFrame = (now, meta) => { shownTime = meta.mediaTime; dirty = true; video.requestVideoFrameCallback(onFrame); };
    video.requestVideoFrameCallback(onFrame);
    video.addEventListener('seeking', () => { shownTime = null; });
  }
  const frameNow = () => Math.min(Math.max(0, Math.round((shownTime === null ? video.currentTime : shownTime) * fps)), ep.total_frames - 1);
  const seek = (frame) => {
    video.currentTime = Math.min(Math.max(0, frame / fps), (video.duration || ep.duration_s) - 0.001);
    dirty = true;
  };

  // ---------------------------------------------------------------- tracks
  const tracks = {};
  Object.entries(data.tracks).forEach(([id, t]) => { tracks[id] = t; });
  const boxAt = (id, frame, tolerance = 1) => {
    const t = tracks[id];
    if (!t) return null;
    const i = nearest(t.f, frame, tolerance);
    return i < 0 ? null : t.b[i];
  };
  const centre = (box) => [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];

  // masks: CVAT RLE (alternating 0 / 1 runs over the box) + the box [left, top, right, bottom]
  const maskFrames = {};
  let masksLoading = false;
  let masksLoaded = false;
  function indexMasks() {
    Object.entries(data.masks || {}).forEach(([id, m]) => {
      maskFrames[id] = Object.keys(m).map(Number).sort((a, b) => a - b);
    });
  }
  indexMasks();
  function loadMasks() { // a file of its own: the masks are most of the data
    if (!data.masks_file || data.masks || masksLoading) return;
    masksLoading = true;
    renderLayersMenu();
    fetchBytes(data.masks_file).then((b) => {
      data.masks = JSON.parse(new TextDecoder().decode(b));
      indexMasks(); masksLoading = false; masksLoaded = true; dirty = true; renderLayersMenu();
    }).catch(() => { masksLoading = false; available.masks = false; layers.masks = false; renderLayersMenu(); });
  }
  const maskCache = new Map();
  function maskBitmap(id, frame, rgb) {
    const key = `${id}:${frame}`;
    if (maskCache.has(key)) return maskCache.get(key);
    const points = data.masks[id][String(frame)];
    const [left, top, right, bottom] = points.slice(-4).map(Math.round);
    const width = right - left + 1;
    const height = bottom - top + 1;
    if (!(width > 0 && height > 0)) return null;
    const image = new ImageData(width, height);
    let offset = 0;
    for (let i = 0; i < points.length - 4; i++) {
      const run = points[i];
      if (i % 2 === 1) {
        const end = Math.min(offset + run, width * height);
        for (let p = offset; p < end; p++) {
          image.data[p * 4] = rgb[0]; image.data[p * 4 + 1] = rgb[1]; image.data[p * 4 + 2] = rgb[2]; image.data[p * 4 + 3] = 255;
        }
      }
      offset += run;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').putImageData(image, 0, 0);
    const entry = { canvas, left, top };
    maskCache.set(key, entry);
    if (maskCache.size > 60) maskCache.delete(maskCache.keys().next().value);
    return entry;
  }
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

  // ---------------------------------------------------------------- depth
  let depthBytes = null;
  let depthLoading = false;
  const depthCache = new Map();
  function loadDepth() {
    if (depthBytes || depthLoading || !data.depth) return;
    depthLoading = true;
    renderLayersMenu();
    fetchBytes(data.depth.file).then((b) => { depthBytes = b; depthLoading = false; dirty = true; renderLayersMenu(); })
      .catch(() => { depthLoading = false; available.depth = false; layers.depth = false; renderLayersMenu(); });
  }
  function depthCanvas(index) {
    if (depthCache.has(index)) return depthCache.get(index);
    const { w, h } = data.depth;
    const size = w * h;
    const slice = depthBytes.subarray(index * size, (index + 1) * size);
    const values = Array.from(slice).filter((v) => v > 0).sort((a, b) => a - b);
    const near = values[Math.floor(values.length * 0.02)] || 0;
    const far = Math.max(values[Math.floor(values.length * 0.98)] || 1, near + 4);
    const stops = [[214, 40, 40], [250, 140, 40], [245, 220, 60], [90, 200, 110], [40, 150, 220], [70, 60, 170]];
    const image = new ImageData(w, h);
    for (let i = 0; i < size; i++) {
      if (!slice[i]) continue;
      const x = Math.min(1, Math.max(0, (slice[i] - near) / (far - near))) * (stops.length - 1);
      const k = Math.min(stops.length - 2, Math.floor(x));
      const f = x - k;
      for (let c = 0; c < 3; c++) image.data[i * 4 + c] = Math.round(stops[k][c] * (1 - f) + stops[k + 1][c] * f);
      image.data[i * 4 + 3] = 255;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').putImageData(image, 0, 0);
    depthCache.set(index, canvas);
    if (depthCache.size > 30) depthCache.delete(depthCache.keys().next().value);
    return canvas;
  }

  // ---------------------------------------------------------------- drawing
  let rect = { x: 0, y: 0, w: 1, h: 1 };
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const bounds = stage.getBoundingClientRect();
    overlay.width = Math.round(bounds.width * dpr);
    overlay.height = Math.round(bounds.height * dpr);
    const ratio = (video.videoWidth || ep.width) / (video.videoHeight || ep.height);
    const w = Math.min(bounds.width, bounds.height * ratio);
    const h = w / ratio;
    rect = { x: (bounds.width - w) / 2, y: (bounds.height - h) / 2, w, h, dpr };
    dirty = true;
  }
  new ResizeObserver(resize).observe(stage);
  video.addEventListener('loadedmetadata', resize);
  // the heavy layers are fetched in the background, so the toggle is instant later; but only once the video is
  // in enough to play (or has failed), so they don't compete with it on a weak link
  let preloaded = false;
  function preloadHeavyLayers() {
    if (preloaded) return;
    preloaded = true;
    loadMasks();
    loadDepth();
  }
  const fullyBuffered = () => video.buffered.length > 0 && video.duration > 0
    && video.buffered.end(video.buffered.length - 1) >= video.duration - 1;
  video.addEventListener('progress', () => { if (fullyBuffered()) preloadHeavyLayers(); });
  video.addEventListener('canplaythrough', preloadHeavyLayers, { once: true });
  video.addEventListener('error', preloadHeavyLayers, { once: true });
  setTimeout(preloadHeavyLayers, 15000); // a browser may stop buffering a long video early

  function label(text, x, y, color) {
    ctx.font = '12px system-ui, sans-serif';
    const width = ctx.measureText(text).width + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x, y - 15, width, 17);
    ctx.fillStyle = color || '#fff';
    ctx.fillText(text, x + 4, y - 2);
  }

  function draw() {
    const frame = frameNow();
    const k = rect.w / ep.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.setTransform(rect.dpr, 0, 0, rect.dpr, 0, 0);
    ctx.translate(rect.x, rect.y);
    const X = (v) => v * k;
    const visible = (id) => !hiddenObjects.has(id);

    if (layers.depth && data.depth) {
      loadDepth();
      const i = depthBytes ? nearest(data.depth.f, frame, 15) : -1;
      if (i >= 0) {
        ctx.globalAlpha = 0.6;
        ctx.drawImage(depthCanvas(i), 0, 0, rect.w, rect.h);
        ctx.globalAlpha = 1;
      }
    }
    if (layers.masks) {
      loadMasks();
      Object.keys(maskFrames).forEach((id) => {
        if (!visible(Number(id))) return;
        const j = nearest(maskFrames[id], frame, 4);
        if (j < 0) return;
        const maskFrame = maskFrames[id][j];
        const m = maskBitmap(id, maskFrame, hex(colorOf(Number(id))));
        if (!m) return;
        // masks exist for every 6th frame, boxes for every frame: carry the mask along the box to this frame
        let left = m.left; let top = m.top; let w = m.canvas.width; let h = m.canvas.height;
        const from = maskFrame === frame ? null : boxAt(id, maskFrame, 0);
        const to = from && boxAt(id, frame, 1);
        if (from && to) {
          const sx = (to[2] - to[0]) / Math.max(1, from[2] - from[0]);
          const sy = (to[3] - to[1]) / Math.max(1, from[3] - from[1]);
          if (sx > 0.5 && sx < 2 && sy > 0.5 && sy < 2) {
            left = to[0] + (m.left - from[0]) * sx; top = to[1] + (m.top - from[1]) * sy; w *= sx; h *= sy;
          }
        }
        ctx.globalAlpha = 0.42;
        ctx.drawImage(m.canvas, X(left), X(top), X(w), X(h));
        ctx.globalAlpha = 1;
      });
    }
    if (layers.trajectories) {
      Object.keys(tracks).forEach((sid) => {
        const id = Number(sid);
        if (!visible(id)) return;
        const t = tracks[sid];
        const from = lowerBound(t.f, frame - 150);
        const to = lowerBound(t.f, frame + 1);
        if (to - from < 2) return;
        ctx.strokeStyle = colorOf(id);
        ctx.lineWidth = 2;
        for (let i = from + 1; i < to; i += 1) {
          if (t.f[i] - t.f[i - 1] > 6) continue;
          const [x0, y0] = centre(t.b[i - 1]);
          const [x1, y1] = centre(t.b[i]);
          ctx.globalAlpha = 0.15 + 0.85 * ((i - from) / (to - from));
          ctx.beginPath(); ctx.moveTo(X(x0), X(y0)); ctx.lineTo(X(x1), X(y1)); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });
    }
    if (layers.boxes) {
      Object.keys(tracks).forEach((sid) => {
        const id = Number(sid);
        if (!visible(id)) return;
        const box = boxAt(sid, frame);
        if (!box) return;
        ctx.strokeStyle = colorOf(id);
        ctx.lineWidth = 2;
        ctx.strokeRect(X(box[0]), X(box[1]), X(box[2] - box[0]), X(box[3] - box[1]));
        label(nameOf(id), X(box[0]), Math.max(16, X(box[1])), colorOf(id));
      });
    }
    if (layers.interactions) {
      data.relationships.forEach((r) => {
        if (frame < r.start || frame > r.end || !visible(r.source) || !visible(r.target)) return;
        const a = boxAt(r.source, frame, 3);
        const b = boxAt(r.target, frame, 3);
        if (!a || !b) return;
        const [nameRu, color, nameEn] = INTERACTIONS[r.type] || INTERACTIONS.unknown;
        const name = lang === 'en' ? nameEn : nameRu;
        const [x0, y0] = centre(a);
        const [x1, y1] = centre(b);
        ctx.strokeStyle = color; ctx.lineWidth = 3;
        ctx.setLineDash(r.status === 'proposed' ? [6, 4] : []);
        ctx.beginPath(); ctx.moveTo(X(x0), X(y0)); ctx.lineTo(X(x1), X(y1)); ctx.stroke();
        ctx.setLineDash([]);
        label(`${name}${r.status === 'proposed' ? ' ?' : ''}`, X((x0 + x1) / 2), X((y0 + y1) / 2), color);
      });
    }
    if (layers.states) {
      const lines = {};
      data.states.forEach((s) => {
        if (frame < s.start || (s.end !== null && frame > s.end) || !visible(s.object)) return;
        (lines[s.object] = lines[s.object] || []).push(stateText(s));
      });
      Object.entries(lines).forEach(([id, texts]) => {
        const box = boxAt(id, frame, 12);
        if (!box) return;
        texts.forEach((text, n) => label(text, X(box[0]), X(box[3]) + 18 + n * 19, '#ffe58f'));
      });
    }
    ['left', 'right'].forEach((side) => {
      const hand = data.hands[side];
      if (!hand) return;
      const i = nearest(hand.f, frame, 3);
      if (i < 0) return;
      const k2 = hand.k2[i];
      if (layers.hand2d) {
        FINGERS.forEach((finger) => {
          ctx.strokeStyle = finger.color; ctx.lineWidth = 2.5;
          ctx.beginPath();
          finger.points.forEach((p, n) => {
            const px = X(k2[3 * p]); const py = X(k2[3 * p + 1]);
            if (n === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          });
          ctx.stroke();
        });
        for (let p = 0; p < 21; p++) {
          if (k2[3 * p + 2] === 0) continue;
          ctx.fillStyle = p === 0 ? '#fff' : FINGERS[Math.floor((p - 1) / 4)].color;
          ctx.beginPath(); ctx.arc(X(k2[3 * p]), X(k2[3 * p + 1]), 3.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      const k3 = hand.k3[i];
      if (layers.hand3d && k3) drawHand3d(k2, k3, X, side);
    });
    drawSubtitles(frame);
    update3dMarkers(frame);
  }

  // the model's 3D hand laid on the 2D points by scale and shift only, nearer joints bigger
  function drawHand3d(k2, k3, X, side) {
    const p2 = []; const p3 = [];
    for (let p = 0; p < 21; p++) { p2.push([k2[3 * p], k2[3 * p + 1]]); p3.push([k3[3 * p], k3[3 * p + 1], k3[3 * p + 2]]); }
    const mean = (pts, c) => pts.reduce((s, q) => s + q[c], 0) / pts.length;
    const m2 = [mean(p2, 0), mean(p2, 1)]; const m3 = [mean(p3, 0), mean(p3, 1)];
    let num = 0; let den = 0;
    for (let p = 0; p < 21; p++) {
      const dx = p3[p][0] - m3[0]; const dy = p3[p][1] - m3[1];
      num += (p2[p][0] - m2[0]) * dx + (p2[p][1] - m2[1]) * dy; den += dx * dx + dy * dy;
    }
    const scale = den > 0 ? num / den : 1;
    const xy = p3.map((q) => [scale * (q[0] - m3[0]) + m2[0], scale * (q[1] - m3[1]) + m2[1]]);
    const zs = p3.map((q) => q[2]); const near = Math.min(...zs); const far = Math.max(...zs);
    const closeness = (p) => (far > near ? 1 - (zs[p] - near) / (far - near) : 1);
    ctx.strokeStyle = '#13c2c2'; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
    FINGERS.forEach((finger) => {
      ctx.beginPath();
      finger.points.forEach((p, n) => { if (n === 0) ctx.moveTo(X(xy[p][0]), X(xy[p][1])); else ctx.lineTo(X(xy[p][0]), X(xy[p][1])); });
      ctx.stroke();
    });
    xy.forEach(([x, y], p) => {
      ctx.globalAlpha = 0.4 + 0.6 * closeness(p);
      ctx.fillStyle = '#13c2c2';
      ctx.beginPath(); ctx.arc(X(x), X(y), 2 + 3 * closeness(p), 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- actions, subtitles
  const activeActions = (frame) => actions.filter((a) => frame >= a.start && frame <= a.end);
  const deepest = (frame) => activeActions(frame).sort((a, b) => b.level - a.level || b.start - a.start)[0];
  const actionTitle = (a) => {
    const title = a.caption || a.type || [a.verb, a.noun, a.hand].filter(Boolean).join(' ') || `${LEVEL_NAMES[a.level]} #${a.id}`;
    return (lang === 'en' && ACTION_EN[title]) || title;
  };

  function drawSubtitles() {
    const box = $('subs');
    let text = '';
    if (layers.subtitles) {
      const frame = frameNow();
      const a = actions.find((x) => x.level === 2 && frame >= x.start && frame <= x.end);
      if (a) text = actionTitle(a);
    }
    if (box.textContent !== text) box.textContent = text;
    box.hidden = !text;
  }

  // ---------------------------------------------------------------- layers menu
  function renderLayersMenu() {
    const panel = $('layers-panel');
    panel.innerHTML = '';
    LAYER_KEYS.forEach((key) => {
      const label = document.createElement('label');
      const on = available[key];
      label.className = on ? '' : 'off';
      const input = document.createElement('input');
      input.type = 'checkbox'; input.checked = !!layers[key]; input.disabled = !on;
      input.addEventListener('change', () => { layers[key] = input.checked; if (key === 'depth' && input.checked) loadDepth(); if (key === 'masks' && input.checked) loadMasks(); dirty = true; updateLayersButton(); });
      const note = (key === 'masks' && masksLoading) || (key === 'depth' && depthLoading && !depthBytes) ? t('loadingNote') : '';
      label.append(input, document.createTextNode(t(key) + (on ? note : t('noData'))));
      panel.append(label);
    });
    if (objects.some((o) => tracks[o.id])) {
      const h = document.createElement('h4');
      h.textContent = t('objects');
      panel.append(h);
      objects.filter((o) => tracks[o.id]).forEach((o) => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox'; input.checked = !hiddenObjects.has(o.id);
        input.addEventListener('change', () => { if (input.checked) hiddenObjects.delete(o.id); else hiddenObjects.add(o.id); dirty = true; });
        const sw = document.createElement('span');
        sw.className = 'swatch'; sw.style.background = colorOf(o.id);
        label.append(input, sw, document.createTextNode(o.name));
        panel.append(label);
      });
    }
    updateLayersButton();
  }
  function updateLayersButton() {
    $('layers-button').textContent = t('layers', Object.keys(layers).filter((k) => layers[k] && available[k]).length);
  }
  $('layers-button').addEventListener('click', () => { $('layers-panel').hidden = !$('layers-panel').hidden; });
  renderLayersMenu();

  // ---------------------------------------------------------------- controls
  $('play').addEventListener('click', () => { if (video.paused) video.play(); else video.pause(); });
  video.addEventListener('play', () => { $('play').textContent = '❚❚'; });
  video.addEventListener('pause', () => { $('play').textContent = '▶'; });
  video.addEventListener('click', () => { if (video.paused) video.play(); else video.pause(); });
  $('speed').addEventListener('change', (e) => { video.playbackRate = Number(e.target.value); });
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    const f = frameNow();
    if (e.code === 'Space') { e.preventDefault(); if (video.paused) video.play(); else video.pause(); }
    else if (e.key === 'ArrowLeft') seek(f - Math.round(fps * (e.shiftKey ? 5 : 1)));
    else if (e.key === 'ArrowRight') seek(f + Math.round(fps * (e.shiftKey ? 5 : 1)));
    else if (e.key === ',') seek(f - 1);
    else if (e.key === '.') seek(f + 1);
  });

  // ---------------------------------------------------------------- timeline
  const timeline = $('timeline');
  const tctx = timeline.getContext('2d');
  const ROW = 20;
  const GUTTER = 92;
  function drawTimeline() {
    const dpr = window.devicePixelRatio || 1;
    const w = timeline.clientWidth; const h = timeline.clientHeight;
    if (timeline.width !== Math.round(w * dpr)) { timeline.width = Math.round(w * dpr); timeline.height = Math.round(h * dpr); }
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tctx.clearRect(0, 0, w, h);
    const total = ep.total_frames;
    const px = (f) => GUTTER + (f / total) * (w - GUTTER);
    tctx.font = '11px system-ui, sans-serif';
    for (let level = 0; level < 3; level++) {
      tctx.fillStyle = 'rgba(255,255,255,0.04)';
      tctx.fillRect(GUTTER, 6 + level * (ROW + 2), w - GUTTER, ROW);
      actions.filter((a) => a.level === level).forEach((a) => {
        const x = px(a.start); const width = Math.max(2, px(a.end) - x);
        tctx.fillStyle = LEVEL_COLORS[level]; tctx.globalAlpha = a.status === 'proposed' ? 0.45 : 0.85;
        tctx.fillRect(x, 6 + level * (ROW + 2), width, ROW);
        tctx.globalAlpha = 1;
        if (width > 50) { tctx.fillStyle = '#10131a'; tctx.fillText(fitText(actionTitle(a), Math.floor(width / 6.5)), x + 4, 6 + level * (ROW + 2) + 14); }
      });
      tctx.fillStyle = '#9aa1ad'; tctx.fillText(LEVEL_NAMES[level], 4, 6 + level * (ROW + 2) + 14);
    }
    const x = px(frameNow());
    tctx.fillStyle = '#ff4d4f'; tctx.fillRect(x - 1, 0, 2, h);
  }
  const seekFromPointer = (e) => {
    const r = timeline.getBoundingClientRect();
    seek(Math.round(((e.clientX - r.left - GUTTER) / (r.width - GUTTER)) * ep.total_frames));
  };
  let scrubbing = false;
  timeline.addEventListener('pointerdown', (e) => { scrubbing = true; timeline.setPointerCapture(e.pointerId); seekFromPointer(e); });
  timeline.addEventListener('pointermove', (e) => {
    if (scrubbing) seekFromPointer(e);
    const r = timeline.getBoundingClientRect();
    const frame = Math.round(((e.clientX - r.left - GUTTER) / (r.width - GUTTER)) * ep.total_frames);
    const level = Math.floor((e.clientY - r.top - 6) / (ROW + 2));
    const hit = actions.filter((a) => a.level === level && frame >= a.start && frame <= a.end)[0];
    const tip = $('timeline-tip');
    tip.hidden = !hit;
    if (hit) { tip.textContent = `${actionTitle(hit)} · ${clock(hit.start / fps)}-${clock(hit.end / fps)}`; tip.style.left = `${e.clientX + 12}px`; tip.style.top = `${e.clientY + 14}px`; }
  });
  timeline.addEventListener('pointerup', () => { scrubbing = false; });
  timeline.addEventListener('pointerleave', () => { $('timeline-tip').hidden = true; });

  // ---------------------------------------------------------------- side panel
  const tabs = { actions: $('tab-actions'), scene3d: $('tab-scene3d'), info: $('tab-info') };
  let tab = 'actions';
  document.querySelectorAll('#tabs button').forEach((button) => {
    if (button.dataset.tab === 'scene3d' && !scenes.length) { button.disabled = true; button.title = t('noScene'); }
    button.addEventListener('click', () => {
      tab = button.dataset.tab;
      document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b === button));
      Object.entries(tabs).forEach(([k, el]) => { el.hidden = k !== tab; });
      if (tab === 'scene3d') initScene3d();
      dirty = true;
    });
  });

  let actionsKey = '';
  function renderActionsTab(frame) {
    const current = activeActions(frame).map((a) => a.id).join(',');
    if (current === actionsKey) return;
    actionsKey = current;
    const box = tabs.actions;
    box.innerHTML = '';
    const now = deepest(frame);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h3>${t('now')}</h3>`;
    if (now) {
      const lines = [`<b>${esc(actionTitle(now))}</b> <span class="badge">${LEVEL_NAMES[now.level]}</span>`];
      if (now.voice && now.voice !== actionTitle(now)) lines.push(`<div class="muted">${t('voice')}: ${esc(now.voice)}</div>`);
      if (now.goal) lines.push(`<div class="muted">${t('goal')}: ${esc(now.goal)}</div>`);
      if (now.outcome) lines.push(`<div class="muted">${t('outcome')}: ${esc(now.outcome)}</div>`);
      if (now.success !== null && now.success !== undefined) lines.push(`<div>${now.success ? t('ok') : t('fail')}</div>`);
      card.insertAdjacentHTML('beforeend', lines.join(''));
    } else card.insertAdjacentHTML('beforeend', `<span class="muted">${t('noAction')}</span>`);
    box.append(card);
    if (!actions.length) box.insertAdjacentHTML('beforeend', `<p class="muted">${t('noActions')}</p>`);
    actions.forEach((a) => {
      const row = document.createElement('div');
      row.className = `action${current.split(',').includes(String(a.id)) ? ' current' : ''}`;
      row.style.paddingLeft = `${6 + a.level * 16}px`;
      row.innerHTML = `<span class="t">${clock(a.start / fps)}</span><span>${esc(actionTitle(a))}</span>${a.status === 'proposed' ? `<span class="badge">${t('unverified')}</span>` : ''}`;
      row.addEventListener('click', () => seek(a.start));
      box.append(row);
    });
  }
  const fitText = (text, max) => (text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`);
  function esc(text) { return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function renderInfo() {
    const box = tabs.info;
    const count = (list) => list.length;
    const handPoses = Object.entries(data.hands).map(([side, h]) => `${t(side === 'left' ? 'left' : 'right')} ${h.f.length}`).join(', ') || t('none');
    const maskCount = data.masks ? Object.values(data.masks).reduce((n, m) => n + Object.keys(m).length, 0) : (data.masks_file ? t('yes') : 0);
    box.innerHTML = `
      <div class="card"><h3>${t('infoWhat')}</h3>
        <div>${t('duration')}: ${clock(ep.duration_s)} · ${Math.round(fps)} ${t('fps')}</div>
        <div>${t('counts', count(actions), count(data.relationships), count(data.states))}</div>
        <div>${t('tracksMasks', Object.keys(tracks).length, maskCount)}</div>
        <div>${t('handFrames', handPoses)}</div>
        <div>${t('depthMaps', data.depth ? data.depth.f.length : 0)}</div>
        <div>${t('scene3dLine', scenes.length ? t('scenesList', scenes.length, scenes.map((g) => `${clock(g.start / fps)}-${clock(g.end / fps)}`).join(', ')) : t('notComputed'))}</div>
      </div>
      <div class="card"><h3>${t('infoRead')}</h3>
        <div>${t('read1')}</div>
        <div style="margin-top:6px">${t('read2')}</div>
      </div>
      <div class="card"><h3>${t('infoLimits')}</h3>
        <div>${t('limits', scenes)}</div>
      </div>`;
  }

  // ---------------------------------------------------------------- scene 3D (point cloud)
  let scene3dReady = false;
  let cloud = null;
  const view = { mode: 'camera', yaw: 0.6, pitch: 0.45, zoom: 1 };
  const PRESETS = { orbit: { yaw: 0.6, pitch: 0.45, zoom: 1 }, top: { yaw: 0, pitch: -1.5, zoom: 1 } };
  const CLOUD_W = 800; const CLOUD_H = 450;
  let cloudCanvas; let cctx; let base = null; let baseDirty = true; let baseFrame = -1;
  let frameInfo = { centre: [0, 0, 0], radius: 1 };

  function loadScene() {
    const g = geometry;
    cloud = null; baseDirty = true; dirty = true;
    const n = scenes.indexOf(g);
    $('s3-info').textContent = t('s3info', n + 1, scenes.length, clock((g.end - g.start) / fps), g.camera.f.length);
    document.querySelectorAll('#s3-scenes .chip').forEach((c) => c.classList.toggle('active', Number(c.dataset.scene) === n));
    if (!g.cloud) return;
    fetchBytes(g.cloud).then((bytes) => {
      if (geometry !== g) return;   // another scene was picked while this one loaded
      const count = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true);
      const copy = bytes.slice(4);
      cloud = { n: count, xyz: new Float32Array(copy.buffer, 0, count * 3), rgb: new Uint8Array(copy.buffer, count * 12, count * 3) };
      const med = (k) => { const v = []; for (let i = 0; i < count; i += Math.max(1, Math.floor(count / 4000))) v.push(cloud.xyz[3 * i + k]); return v.sort((a, b) => a - b); };
      const [xs, ys, zs] = [med(0), med(1), med(2)];
      const mid = (v) => v[Math.floor(v.length / 2)] || 0;
      const span = (v) => (v[Math.floor(v.length * 0.97)] || 0) - (v[Math.floor(v.length * 0.03)] || 0);
      frameInfo = { centre: [mid(xs), mid(ys), mid(zs)], radius: Math.max(span(xs), span(ys), span(zs), 0.5) / 2 };
      baseDirty = true; dirty = true;
    }).catch(() => { if (geometry === g) $('s3-info').textContent += t('s3cloudFail'); });
  }

  function setMode(mode) {
    view.mode = mode;
    if (PRESETS[mode]) Object.assign(view, PRESETS[mode]);
    document.querySelectorAll('#s3-modes button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    const help = $('s3-help');
    if (help) help.textContent = t(mode === 'camera' ? 'helpCamera' : 'helpOrbit');
    baseDirty = true; dirty = true;
  }

  function initScene3d() {
    if (scene3dReady || !scenes.length) return;
    scene3dReady = true;
    geometry = sceneAt(frameNow()) || geometry;
    const box = tabs.scene3d;
    box.innerHTML = `
      <div class="card"><h3>${t('s3title')}</h3>
        <div class="chips" id="s3-scenes"></div>
        <div class="chips" id="s3-modes"></div>
        <div class="muted" id="s3-info"></div>
        <canvas id="cloud" width="${CLOUD_W}" height="${CLOUD_H}"></canvas>
        <div class="legend"><span><span class="swatch" style="background:#fff"></span> ${t('camNow')}</span><span><span class="swatch" style="background:${HAND_COLORS.left}"></span> ${t('leftHand')}</span><span><span class="swatch" style="background:${HAND_COLORS.right}"></span> ${t('rightHand')}</span><span>${t('trail')}</span></div>
        <div class="muted" id="s3-help"></div>
      </div>`;
    scenes.forEach((g, n) => {
      const chip = document.createElement('button');
      chip.type = 'button'; chip.className = 'chip'; chip.dataset.scene = n;
      chip.textContent = `${n + 1} · ${clock(g.start / fps)}-${clock(g.end / fps)}`;
      chip.addEventListener('click', () => { seek(g.start); });
      $('s3-scenes').append(chip);
    });
    [['camera', 'modeCamera'], ['orbit', 'modeOrbit'], ['top', 'modeTop']].forEach(([mode, key]) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'chip'; button.dataset.mode = mode; button.textContent = t(key);
      button.addEventListener('click', () => setMode(mode));
      $('s3-modes').append(button);
    });
    cloudCanvas = $('cloud'); cctx = cloudCanvas.getContext('2d');
    let drag = null;
    cloudCanvas.addEventListener('pointerdown', (e) => {
      if (view.mode === 'camera') return;
      cloudCanvas.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch };
    });
    cloudCanvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const k = 0.01 * (CLOUD_W / cloudCanvas.clientWidth);
      view.yaw = drag.yaw + (e.clientX - drag.x) * k;
      view.pitch = Math.max(-1.55, Math.min(1.55, drag.pitch + (e.clientY - drag.y) * k));
      baseDirty = true; dirty = true;
    });
    cloudCanvas.addEventListener('pointerup', () => { drag = null; });
    cloudCanvas.addEventListener('dblclick', () => { if (view.mode !== 'camera') setMode(view.mode); });
    cloudCanvas.addEventListener('wheel', (e) => {
      if (view.mode === 'camera') return;
      e.preventDefault(); view.zoom = Math.min(6, Math.max(0.3, view.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); baseDirty = true; dirty = true;
    }, { passive: false });
    if (!scenes.every((g) => g.camera.q)) { view.mode = 'orbit'; $('s3-modes').firstChild.disabled = true; }
    loadScene();
    setMode(view.mode);
  }

  // ---- projections: both return (x, y, z) => [screenX, screenY, depth]
  function orbitProjector() {
    const W = CLOUD_W; const H = CLOUD_H;
    const cy = Math.cos(view.yaw); const sy = Math.sin(view.yaw); const cp = Math.cos(view.pitch); const sp = Math.sin(view.pitch);
    const distance = (frameInfo.radius * 2.3) / view.zoom; const focal = H * 1.1; const c = frameInfo.centre;
    return (x, y, z) => {
      const px = x - c[0]; const py = -(y - c[1]); const pz = z - c[2];
      const rx = cy * px - sy * pz; const rz = sy * px + cy * pz;
      const ry = cp * py - sp * rz; const rz2 = sp * py + cp * rz + distance;
      return [W / 2 + (focal * rx) / rz2, H / 2 - (focal * ry) / rz2, rz2];
    };
  }

  function quatToMatrix([x, y, z, w]) {
    return [
      [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ];
  }

  function slerp(a, b, u) {
    let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    const sign = dot < 0 ? -1 : 1; dot *= sign;
    let ka = 1 - u; let kb = u * sign;
    if (dot < 0.9995) { const th = Math.acos(dot); const s = Math.sin(th); ka = Math.sin((1 - u) * th) / s; kb = (Math.sin(u * th) / s) * sign; }
    const q = a.map((v, i) => ka * v + kb * b[i]);
    const n = Math.hypot(...q) || 1;
    return q.map((v) => v / n);
  }

  // pose of the camera at a moment: position, and rotation (camera -> world) when the data has it
  function cameraPose(frame) {
    const cam = geometry.camera; const f = cam.f;
    if (frame < f[0] || frame > f[f.length - 1]) return null;
    const i = Math.max(0, lowerBound(f, frame + 1) - 1);
    const j = Math.min(i + 1, f.length - 1);
    const u = j === i ? 0 : (frame - f[i]) / (f[j] - f[i]);
    const p = cam.p[i].map((v, c) => v * (1 - u) + cam.p[j][c] * u);
    return { p, R: cam.q ? quatToMatrix(slerp(cam.q[i], cam.q[j], u)) : null };
  }

  function cameraProjector(pose) {
    const { p, R } = pose;
    const focal = (CLOUD_W / 2) / Math.tan((geometry.fov_deg * Math.PI) / 360);
    return (x, y, z) => {
      const dx = x - p[0]; const dy = y - p[1]; const dz = z - p[2];
      const cx = R[0][0] * dx + R[1][0] * dy + R[2][0] * dz;
      const cy = R[0][1] * dx + R[1][1] * dy + R[2][1] * dz;
      const cz = R[0][2] * dx + R[1][2] * dy + R[2][2] * dz;
      return [CLOUD_W / 2 + (focal * cx) / cz, CLOUD_H / 2 + (focal * cy) / cz, cz];
    };
  }

  function drawCloudBase(project, firstPerson) {
    const W = CLOUD_W; const H = CLOUD_H;
    base = new ImageData(W, H);
    const buffer = new Float32Array(W * H).fill(Infinity);
    for (let i = 0; i < W * H; i++) { base.data[i * 4] = 24; base.data[i * 4 + 1] = 26; base.data[i * 4 + 2] = 31; base.data[i * 4 + 3] = 255; }
    if (cloud) {
      const focal = firstPerson ? (W / 2) / Math.tan((geometry.fov_deg * Math.PI) / 360) : H * 1.1;
      for (let i = 0; i < cloud.n; i++) {
        const [sx, sy, d] = project(cloud.xyz[3 * i], cloud.xyz[3 * i + 1], cloud.xyz[3 * i + 2]);
        if (d <= 0.1) continue;
        // a point is a little square, bigger when near, so the picture stays solid
        const size = firstPerson ? Math.max(2, Math.min(9, Math.round((focal * 0.014) / d))) : 4;
        const x0 = Math.round(sx - size / 2); const y0 = Math.round(sy - size / 2);
        for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
          const x = x0 + dx; const y = y0 + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const at = y * W + x;
          if (d < buffer[at]) { buffer[at] = d; base.data[at * 4] = cloud.rgb[3 * i]; base.data[at * 4 + 1] = cloud.rgb[3 * i + 1]; base.data[at * 4 + 2] = cloud.rgb[3 * i + 2]; }
        }
      }
    }
    baseDirty = false;
  }

  function update3dMarkers(frame) {
    if (!scene3dReady || tab !== 'scene3d' || !cloudCanvas) return;
    const here = sceneAt(frame);
    if (here && here !== geometry) { geometry = here; loadScene(); }
    const pose = cameraPose(frame);
    const firstPerson = view.mode === 'camera' && !!pose && !!pose.R;
    if (firstPerson && baseFrame !== frame) baseDirty = true;
    const project = firstPerson ? cameraProjector(pose) : orbitProjector();
    if (baseDirty || !base) { drawCloudBase(project, firstPerson); baseFrame = frame; }
    cctx.putImageData(base, 0, 0);
    // a line through points; the points behind the viewer cut it
    const trail = (points, color, width, dashed) => {
      cctx.beginPath(); let open = false;
      points.forEach((p) => {
        const [x, y, d] = project(p[0], p[1], p[2]);
        if (d <= 0.1) { open = false; return; }
        if (!open) { cctx.moveTo(x, y); open = true; } else cctx.lineTo(x, y);
      });
      cctx.strokeStyle = color; cctx.lineWidth = width * 1.6; cctx.setLineDash(dashed ? [8, 5] : []); cctx.stroke(); cctx.setLineDash([]);
    };
    const dot = (p, color, r, label) => {
      const [x, y, d] = project(p[0], p[1], p[2]);
      if (d <= 0.1) return;
      cctx.fillStyle = color; cctx.beginPath(); cctx.arc(x, y, r * 1.6, 0, Math.PI * 2); cctx.fill();
      cctx.strokeStyle = '#000'; cctx.lineWidth = 2.5; cctx.stroke();
      if (label) { cctx.fillStyle = '#fff'; cctx.font = 'bold 22px system-ui, sans-serif'; cctx.fillText(label, x + r * 1.6 + 5, y + 7); }
    };
    const win = Math.round(fps * 2);
    const cam = geometry.camera;
    if (!firstPerson) {
      trail(cam.p, 'rgba(255,255,255,0.22)', 1.5, false);              // the whole path of the scene
      const a = lowerBound(cam.f, frame - win); const b = lowerBound(cam.f, frame + 1);
      trail(cam.p.slice(a, b), '#e6e8ec', 2.5, false);
      if (pose) {
        dot(pose.p, '#ffffff', 5);
        if (pose.R) {   // the field of view of the camera as a small pyramid
          const half = Math.tan((geometry.fov_deg * Math.PI) / 360); const depth = Math.max(0.25, frameInfo.radius * 0.14);
          const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
            const c = [sx * half * depth, sy * half * depth * (CLOUD_H / CLOUD_W), depth];
            return [0, 1, 2].map((r) => pose.R[r][0] * c[0] + pose.R[r][1] * c[1] + pose.R[r][2] * c[2] + pose.p[r]);
          });
          corners.forEach((c, n) => { trail([pose.p, c], '#ffffff', 1.5, false); trail([c, corners[(n + 1) % 4]], '#ffffff', 1.5, false); });
        }
      }
    }
    Object.entries(geometry.hands).forEach(([side, h]) => {
      const from = lowerBound(h.f, frame - win); const to = lowerBound(h.f, frame + 1);
      trail(h.wrist.slice(from, to), HAND_COLORS[side], 3, false);
      const i = nearest(h.f, frame, 8);
      if (i >= 0) dot(h.wrist[i], HAND_COLORS[side], 6, side === 'left' ? 'L' : 'R');
    });
    cctx.fillStyle = 'rgba(230,232,236,0.9)'; cctx.font = '20px system-ui, sans-serif';
    cctx.fillText(t(firstPerson ? 'modeCamera' : view.mode === 'top' ? 'modeTop' : 'modeOrbit'), 14, 30);
    if (!pose) { cctx.fillStyle = '#ffb3b3'; cctx.fillText(t('outside3d'), 14, 60); }
  }

  // ---------------------------------------------------------------- loop
  renderInfo();
  // the right panel can be folded away to give the video the whole width
  function setSideHidden(hidden) {
    $('app').classList.toggle('side-hidden', hidden);
    $('side-toggle').setAttribute('aria-expanded', String(!hidden));
    $('side-toggle').textContent = t(hidden ? 'showPanel' : 'hidePanel');
    window.dispatchEvent(new Event('resize'));
  }
  $('side-toggle').addEventListener('click', () => setSideHidden(!$('app').classList.contains('side-hidden')));
  setSideHidden(true);   // the menu starts folded away; the button in the header opens it
  function setLang(next) {
    if (!I18N[next] || next === lang) return;
    lang = next;
    try { localStorage.setItem('lang', lang); } catch (e) { /* ignore */ }
    applyStaticText(); setTitles(); renderLayersMenu(); renderInfo();
    $('side-toggle').textContent = t($('app').classList.contains('side-hidden') ? 'showPanel' : 'hidePanel');
    actionsKey = ''; dirty = true;
    if (scene3dReady) { scene3dReady = false; if (tab === 'scene3d') initScene3d(); }
  }
  document.querySelectorAll('#lang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
  // a link can open the page at a moment with layers on: #t=30&layers=depth,hand3d&tab=scene3d
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('layers') !== null) {
    Object.keys(layers).forEach((key) => { layers[key] = hash.get('layers').split(',').includes(key) && available[key]; });
    if (layers.depth) loadDepth();
    renderLayersMenu();
  }
  if (hash.get('t')) video.addEventListener('loadedmetadata', () => { video.currentTime = Number(hash.get('t')); }, { once: true });
  if (hash.get('tab')) { const button = document.querySelector(`#tabs button[data-tab="${hash.get('tab')}"]`); if (button && !button.disabled) button.click(); }
  let lastFrame = -1;
  function tick() {
    const frame = frameNow();
    if (frame !== lastFrame || dirty) {
      lastFrame = frame;
      dirty = false;
      draw();
      drawTimeline();
      renderActionsTab(frame);
      $('time').textContent = `${clock(video.currentTime)} / ${clock(video.duration || ep.duration_s)}`;
      $('frame').textContent = t('frame', frame);
    }
    requestAnimationFrame(tick);
  }
  window.addEventListener('resize', () => { dirty = true; });
  resize();
  tick();
}

applyStaticText();
main().catch((error) => {
  $('loading').hidden = false;
  $('loading').textContent = t('loadFail', error.message);
});
