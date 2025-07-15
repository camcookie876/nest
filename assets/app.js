// assets/app.js

// --------------------------
// OAuth Callback Handling
// --------------------------
function getParam(key) {
  const params = new URLSearchParams(window.location.search);
  return params.get(key);
}

async function handleGitHubCallback() {
  const code = getParam('code');
  if (!code) return;
  
  try {
    const resp = await fetch('/.netlify/functions/github-callback?code=' + code);
    const { profile, token } = await resp.json();
    
    // Persist login info
    localStorage.setItem('currentUser', profile.login);
    localStorage.setItem('gh_token', token);
    
    // Redirect back to profile page
    window.location.href = '/account/';
    
  } catch (err) {
    console.error('GitHub OAuth failed', err);
    document.body.innerHTML = '<p>Authentication error. Please try again.</p>';
  }
}

// If we're on the OAuth callback path, handle it and skip normal init
if (window.location.pathname.includes('/auth/github/callback')) {
  handleGitHubCallback();
} else {
  document.addEventListener('DOMContentLoaded', init);
}

// --------------------------
// Global State & Constants
// --------------------------
const DATA_URL = 'data/data.json';
let state = {
  data: null,
  draft: {}
};

// --------------------------
// Data Loading & Utils
// --------------------------
async function loadData() {
  if (!state.data) {
    const res = await fetch(DATA_URL);
    state.data = await res.json();
  }
  return state.data;
}

function downloadDataJson() {
  const content = JSON.stringify(state.data, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'data.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// --------------------------
// Router & Initialization
// --------------------------
async function init() {
  await loadData();
  if (document.getElementById('story-content')) renderStoryView();
  else if (document.getElementById('story-form')) setupStoryForm();
  else if (document.getElementById('project-name')) renderCodeView();
  else if (document.getElementById('code-form')) setupCodeForm();
  else if (document.getElementById('collection-name')) renderCollectionView();
  else if (document.getElementById('collection-form')) setupCollectionForm();
  else if (document.getElementById('tags-list') || document.getElementById('tag-items')) renderTagPage();
  else if (document.getElementById('search-results')) renderSearchPage();
  else if (document.getElementById('profile-name') && !document.getElementById('settings-form')) renderProfileView();
  else if (document.getElementById('settings-form')) setupSettingsForm();
  else if (document.getElementById('moderation-queue')) renderAdminPage();
  else renderHomepage();
}

// --------------------------
// HOMEPAGE
// --------------------------
function renderHomepage() {
  const { stories, codeProjects, tags } = state.data;

  // Featured Stories
  const feat = stories.slice(0, 5);
  const carousel = document.querySelector('#featured-stories .carousel');
  feat.forEach(s => {
    const card = document.createElement('a');
    card.href = `story/?id=${s.id}`;
    card.innerHTML = `<h3>${s.title}</h3><p>By ${s.author}</p>`;
    carousel.appendChild(card);
  });

  // Latest Code Projects
  const latest = codeProjects.slice(-6);
  const grid = document.querySelector('#latest-code .code-grid');
  latest.forEach(p => {
    const card = document.createElement('a');
    card.href = `code/?id=${p.id}`;
    card.innerHTML = `<h3>${p.name}</h3><p>By ${p.author}</p>`;
    grid.appendChild(card);
  });

  // Tag Cloud
  const tagDiv = document.querySelector('#tag-cloud .tags-list');
  tags.forEach(t => {
    const a = document.createElement('a');
    a.href = `tag/?tag=${encodeURIComponent(t.tag)}`;
    a.textContent = `#${t.tag}`;
    tagDiv.appendChild(a);
  });
}

// --------------------------
// STORY VIEW
// --------------------------
function renderStoryView() {
  const id = getParam('id');
  const story = state.data.stories.find(s => s.id == id);
  if (!story) return;

  const art = document.getElementById('story-content');
  art.innerHTML = `<h1>${story.title}</h1>
                   <div>${story.body}</div>
                   <p class="byline">By ${story.author}</p>`;

  const imgs = document.getElementById('story-images');
  story.images.forEach(img => {
    const el = document.createElement('img');
    el.src = img.content;
    el.alt = img.alt || '';
    imgs.appendChild(el);
  });

  const tags = document.getElementById('story-tags');
  story.tags.forEach(t => {
    const a = document.createElement('a');
    a.href = `?tag=${encodeURIComponent(t)}`;
    a.textContent = `#${t}`;
    tags.appendChild(a);
  });
}

// --------------------------
// STORY CREATE
// --------------------------
function setupStoryForm() {
  const form = document.getElementById('story-form');
  const draftKey = 'draft-story';

  // Load saved draft
  const saved = JSON.parse(localStorage.getItem(draftKey) || '{}');
  if (saved.title) form.title.value = saved.title;
  if (saved.body) form.body.value = saved.body;
  if (saved.tags) form.tags.value = saved.tags.join(',');
  if (saved.warnings) form.warnings.value = saved.warnings.join(',');
  state.draft.images = saved.images || [];

  // Preview container
  const preview = document.createElement('div');
  preview.id = 'story-images-preview';
  preview.className = 'media-gallery';
  form.insertBefore(preview, form.images.nextSibling);

  function renderPreviews() {
    preview.innerHTML = '';
    state.draft.images.forEach(img => {
      const el = document.createElement('img');
      el.src = img.content;
      el.alt = img.alt;
      preview.appendChild(el);
    });
  }
  renderPreviews();

  function saveDraft() {
    const d = {
      title: form.title.value,
      body: form.body.value,
      tags: form.tags.value.split(',').map(s=>s.trim()).filter(Boolean),
      warnings: form.warnings.value.split(',').map(s=>s.trim()).filter(Boolean),
      images: state.draft.images
    };
    localStorage.setItem(draftKey, JSON.stringify(d));
    document.getElementById('save-status').textContent = 'Draft saved';
  }

  form.images.addEventListener('change', e => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        state.draft.images.push({
          filename: file.name,
          mimeType: file.type,
          content: reader.result,
          alt: file.name
        });
        renderPreviews();
        saveDraft();
      };
      reader.readAsDataURL(file);
    });
  });

  ['title','body','tags','warnings'].forEach(name => {
    form[name].addEventListener('input', saveDraft);
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const all = state.data.stories;
    const newId = Math.max(0, ...all.map(s=>s.id)) + 1;
    const story = {
      id: newId,
      title: form.title.value || '(no title)',
      body: form.body.value,
      tags: form.tags.value.split(',').map(s=>s.trim()).filter(Boolean),
      warnings: form.warnings.value.split(',').map(s=>s.trim()).filter(Boolean),
      author: localStorage.getItem('currentUser') || 'guest',
      images: state.draft.images
    };
    all.push(story);
    downloadDataJson();
    alert('Story ready! Replace data/data.json with the downloaded file.');
    localStorage.removeItem(draftKey);
    window.location.href = `../story/?id=${newId}`;
  });
}

// --------------------------
// CODE VIEW
// --------------------------
function renderCodeView() {
  const id = getParam('id');
  const proj = state.data.codeProjects.find(p=>p.id==id);
  if (!proj) return;

  document.getElementById('project-name').textContent = proj.name;
  const tabs = document.getElementById('file-tabs');
  const content = document.getElementById('code-content');
  const iframe = document.getElementById('live-preview');

  function showFile(file) {
    content.textContent = file.content;
    if (file.filename.endsWith('.html')) {
      const blob = new Blob([file.content], { type: 'text/html' });
      iframe.src = URL.createObjectURL(blob);
    }
    Array.from(tabs.children).forEach(btn => btn.classList.remove('active'));
    const active = Array.from(tabs.children).find(b=>b.textContent===file.filename);
    if (active) active.classList.add('active');
  }

  proj.files.forEach((f,i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = f.filename;
    btn.addEventListener('click', () => showFile(f));
    tabs.appendChild(btn);
    if (i===0) showFile(f);
  });
}

// --------------------------
// CODE CREATE
// --------------------------
function setupCodeForm() {
  const form = document.getElementById('code-form');
  state.draft = { name:'', files:[] };

  const fileList = document.getElementById('file-list');
  const addBtn = document.getElementById('add-file-btn');
  const fnameInput = document.getElementById('current-filename');
  const editor = document.getElementById('code-editor');
  let currentFile = null;

  function refreshList() {
    fileList.innerHTML = '';
    state.draft.files.forEach(f => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = f.filename;
      a.addEventListener('click', e=>{
        e.preventDefault();
        currentFile = f;
        fnameInput.value = f.filename;
        editor.value = f.content;
      });
      li.appendChild(a);
      fileList.appendChild(li);
    });
  }

  addBtn.addEventListener('click', () => {
    const f = { filename:`file${state.draft.files.length+1}.txt`, content:'' };
    state.draft.files.push(f);
    refreshList();
  });

  document.getElementById('save-file-btn')
    .addEventListener('click', ()=>{
      if (!currentFile) return;
      currentFile.filename = fnameInput.value;
      currentFile.content = editor.value;
      refreshList();
    });

  form.addEventListener('submit', e=>{
    e.preventDefault();
    const all = state.data.codeProjects;
    const newId = Math.max(0, ...all.map(p=>p.id)) + 1;
    const proj = {
      id: newId,
      name: form['name'].value,
      files: state.draft.files,
      tags: [],
      author: localStorage.getItem('currentUser') || 'guest'
    };
    all.push(proj);
    downloadDataJson();
    alert('Project ready! Replace data/data.json with the downloaded file.');
    window.location.href = `../code/?id=${newId}`;
  });
}

// --------------------------
// COLLECTION VIEW
// --------------------------
function renderCollectionView() {
  const id = getParam('id');
  const col = state.data.collections.find(c=>c.id==id);
  if (!col) return;
  document.getElementById('collection-name').textContent = col.name;

  const container = document.getElementById('collection-items');
  col.items.forEach(item => {
    const link = document.createElement('a');
    if (item.type==='story') {
      const s = state.data.stories.find(s=>s.id==item.id);
      link.href = `../story/?id=${s.id}`;
      link.textContent = s.title;
    } else {
      const p = state.data.codeProjects.find(p=>p.id==item.id);
      link.href = `../code/?id=${p.id}`;
      link.textContent = p.name;
    }
    container.appendChild(link);
  });
}

// --------------------------
// COLLECTION CREATE
// --------------------------
function setupCollectionForm() {
  const form = document.getElementById('collection-form');
  const list = document.getElementById('items-list');

  state.data.stories.forEach(s=>{
    const lab = document.createElement('label');
    lab.innerHTML = `<input type="checkbox" name="items" value="story:${s.id}"> Story: ${s.title}`;
    list.appendChild(lab);
  });
  state.data.codeProjects.forEach(p=>{
    const lab = document.createElement('label');
    lab.innerHTML = `<input type="checkbox" name="items" value="code:${p.id}"> Code: ${p.name}`;
    list.appendChild(lab);
  });

  form.addEventListener('submit', e=>{
    e.preventDefault();
    const all = state.data.collections;
    const newId = Math.max(0, ...all.map(c=>c.id)) + 1;
    const items = Array.from(form['items'])
      .filter(ch=>ch.checked)
      .map(ch=>{
        const [type,id] = ch.value.split(':');
        return { type, id: parseInt(id) };
      });
    const col = {
      id: newId,
      name: form['name'].value,
      items,
      author: localStorage.getItem('currentUser') || 'guest'
    };
    all.push(col);
    downloadDataJson();
    alert('Collection ready! Replace data/data.json with the downloaded file.');
    window.location.href = `../collection/?id=${newId}`;
  });
}

// --------------------------
// TAG PAGE
// --------------------------
function renderTagPage() {
  const tag = getParam('tag');
  if (!tag) {
    state.data.tags.forEach(t=>{
      const a = document.createElement('a');
      a.href = `?tag=${encodeURIComponent(t.tag)}`;
      a.textContent = `#${t.tag}`;
      document.getElementById('tags-list').appendChild(a);
    });
  } else {
    const container = document.getElementById('tag-items');
    state.data.stories
      .filter(s=>s.tags.includes(tag))
      .forEach(s=>{
        const a = document.createElement('a');
        a.href = `../story/?id=${s.id}`;
        a.textContent = s.title;
        container.appendChild(a);
      });
    state.data.codeProjects
      .filter(p=>p.tags.includes(tag))
      .forEach(p=>{
        const a = document.createElement('a');
        a.href = `../code/?id=${p.id}`;
        a.textContent = p.name;
        container.appendChild(a);
      });
  }
}

// --------------------------
// SEARCH
// --------------------------
function renderSearchPage() {
  const q = (getParam('query') || '').toLowerCase();
  if (!q) return;
  const res = document.getElementById('search-results');

  // Stories
  state.data.stories
    .filter(s=>s.title.toLowerCase().includes(q))
    .forEach(s=>{
      const a = document.createElement('a');
      a.href = `../story/?id=${s.id}`;
      a.textContent = `Story: ${s.title}`;
      res.appendChild(a);
    });

  // Code Projects
  state.data.codeProjects
    .filter(p=>p.name.toLowerCase().includes(q))
    .forEach(p=>{
      const a = document.createElement('a');
      a.href = `../code/?id=${p.id}`;
      a.textContent = `Code: ${p.name}`;
      res.appendChild(a);
    });

  // Users
  state.data.users
    .filter(u=>u.displayName.toLowerCase().includes(q))
    .forEach(u=>{
      const a = document.createElement('a');
      a.href = `../account/?user=${encodeURIComponent(u.username)}`;
      a.textContent = `User: ${u.displayName}`;
      res.appendChild(a);
    });
}

// --------------------------
// PROFILE VIEW
// --------------------------
function renderProfileView() {
  const user = getParam('user');
  const u = state.data.users.find(x=>x.username===user);
  if (!u) return;

  document.getElementById('profile-avatar').src = u.avatar?.content || '';
  document.getElementById('profile-name').textContent = u.displayName;
  document.getElementById('profile-bio').textContent = u.bio;

  const sdiv = document.getElementById('profile-stories').querySelector('.item-list');
  state.data.stories
    .filter(s=>s.author===user)
    .forEach(s=>{
      const a = document.createElement('a');
      a.href = `../story/?id=${s.id}`;
      a.textContent = s.title;
      sdiv.appendChild(a);
    });

  const cdiv = document.getElementById('profile-code').querySelector('.item-list');
  state.data.codeProjects
    .filter(p=>p.author===user)
    .forEach(p=>{
      const a = document.createElement('a');
      a.href = `../code/?id=${p.id}`;
      a.textContent = p.name;
      cdiv.appendChild(a);
    });
}

// --------------------------
// PROFILE SETTINGS
// --------------------------
function setupSettingsForm() {
  const form = document.getElementById('settings-form');
  const user = localStorage.getItem('currentUser') || 'guest';
  const u = state.data.users.find(x=>x.username===user);

  form['displayName'].value = u.displayName;
  form['bio'].value = u.bio;

  form.avatar.addEventListener('change', e=>{
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = ()=>{
      u.avatar = { mimeType: file.type, content: reader.result };
    };
    reader.readAsDataURL(file);
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    u.displayName = form['displayName'].value;
    u.bio = form['bio'].value;
    downloadDataJson();
    alert('Profile updated! Replace data/data.json with the downloaded file.');
    window.location.href = '../';
  });
}

// --------------------------
// ADMIN CONSOLE
// --------------------------
function renderAdminPage() {
  const logEntries = state.data.moderationLog || [];
  const queue = document
    .getElementById('moderation-queue')
    .querySelector('.item-list');

  logEntries.forEach(entry => {
    const div = document.createElement('div');
    div.className = 'mod-item';
    div.innerHTML = `<p>[${entry.timestamp}] ${entry.action} ${entry.itemType} #${entry.itemId} by ${entry.by}</p>`;

    const approveBtn = document.createElement('button');
    approveBtn.textContent = 'Approve';
    approveBtn.addEventListener('click', () => {
      entry.approved = true;
      downloadDataJson();
      queue.removeChild(div);
    });

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      if (entry.itemType === 'story') {
        state.data.stories = state.data.stories.filter(
          s => s.id !== entry.itemId
        );
      } else if (entry.itemType === 'code') {
        state.data.codeProjects = state.data.codeProjects.filter(
          p => p.id !== entry.itemId
        );
      }
      entry.removed = true;
      downloadDataJson();
      queue.removeChild(div);
    });

    div.appendChild(approveBtn);
    div.appendChild(removeBtn);
    queue.appendChild(div);
  });

  const ucContainer = document
    .getElementById('user-controls')
    .querySelector('.item-list');

  state.data.users.forEach(u => {
    const div = document.createElement('div');
    div.textContent = u.username;

    const banBtn = document.createElement('button');
    banBtn.textContent = 'Ban';
    banBtn.addEventListener('click', () => {
      u.banned = true;
      downloadDataJson();
      banBtn.disabled = true;
    });

    div.appendChild(banBtn);
    ucContainer.appendChild(div);
  });
}