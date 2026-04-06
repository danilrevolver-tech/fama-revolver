// Async render wrappers for Supabase migration
// These wrap the existing render functions to handle async data fetching

async function renderHomeViewAsync() {
  const login = getCurrentLogin();
  const isPrivileged = hasRole(ROLES.OWNER, ROLES.ADMIN);
  const newsList = (await getNews()).slice().reverse();
  const treasury = await getTreasury();

  let html = `
    <section class="view view-home">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
        <h2 style="margin:0;">Новости семьи</h2>
        ${isPrivileged ? '<button class="btn btn--primary" id="toggle-news-form" style="padding:6px 14px;">+ Новая новость</button>' : ''}
      </div>
  `;

  if (treasury && (treasury.title || treasury.goal)) {
    const pct = treasury.goal > 0 ? Math.min(100, Math.round((treasury.current / treasury.goal) * 100)) : 0;
    const formatMoney = (n) => Number(n).toLocaleString('ru-RU') + ' $';
    let barColor = '#3b82f6';
    if (pct >= 100) barColor = '#10b981';
    else if (pct >= 60) barColor = '#f59e0b';

    html += `
      <div class="card" style="margin-bottom:20px; border: 1px solid #1e293b; padding: 0; overflow: hidden;">
        ${treasury.image ? `<img src="${escapeHtml(treasury.image)}" alt="Фото цели" style="width:100%; max-height:200px; object-fit:cover;" onerror="this.style.display='none'" />` : ''}
        <div style="padding: 16px;">
          <h3 style="margin: 0 0 6px; font-size:1.2rem; color:#f8fafc;">Общак: ${escapeHtml(treasury.title)}</h3>
          ${treasury.description ? `<p style="color:#9ca3af; margin: 0 0 12px; font-size:0.9rem;">${escapeHtml(treasury.description)}</p>` : ''}
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="color:#d1d5db; font-size:0.9rem;">Собрано: <strong style="color:#f8fafc;">${formatMoney(treasury.current)}</strong></span>
            <span style="color:#d1d5db; font-size:0.9rem;">Цель: <strong style="color:#f8fafc;">${formatMoney(treasury.goal)}</strong></span>
          </div>
          <div style="background:#1e293b; border-radius:999px; height:16px; overflow:hidden; margin-bottom:8px;">
            <div style="width:${pct}%; background: linear-gradient(90deg, ${barColor}, ${barColor}cc); height:100%; border-radius:999px; transition: width 0.8s ease; display:flex; align-items:center; justify-content:center;">
              ${pct > 10 ? `<span style="font-size:0.7rem; font-weight:bold; color:#fff;">${pct}%</span>` : ''}
            </div>
          </div>
          ${pct <= 10 ? `<div style="text-align:right; font-size:0.8rem; color:#6b7280;">${pct}%</div>` : ''}
          ${pct >= 100 ? `<div class="notice notice--info" style="margin-top:8px; font-size:0.9rem;">Цель достигнута! 🎉</div>` : ''}
        </div>
      </div>
    `;
  }

  if (isPrivileged) {
    html += `
      <div id="news-form-wrap" style="display:none; margin-bottom:20px;">
        <div class="card" style="border: 1px solid #3b82f6;">
          <h3 style="margin-top:0;">Создать новость</h3>
          <div class="form__group"><label>Заголовок</label><input type="text" id="news-title-input" placeholder="Заголовок новости..." /></div>
          <div class="form__group"><label>Текст</label><textarea id="news-text-input" placeholder="Текст новости..."></textarea></div>
          <div class="form__group"><label>Фото (ссылка, необязательно)</label><input type="url" id="news-image-input" placeholder="https://..." /></div>
          <button class="btn btn--primary" id="news-submit-btn">Опубликовать</button>
        </div>
      </div>
    `;
  }

  if (newsList.length === 0) {
    html += `<div class="notice notice--info">Новостей пока нет. Администрация скоро что-нибудь напишет!</div>`;
  } else {
    for (const n of newsList) {
      html += `
        <div class="card" style="margin-bottom:16px; border-left: 4px solid #3b82f6; position:relative;">
          ${isPrivileged ? `<button class="btn btn--ghost delete-news-btn" data-news-id="${n.id}" style="position:absolute;top:10px;right:10px;padding:3px 8px;font-size:0.75rem;">×</button>` : ''}
          ${n.image ? `<img src="${escapeHtml(n.image)}" alt="Фото новости" style="width:100%;max-height:280px;object-fit:cover;border-radius:8px;margin-bottom:12px;" onerror="this.style.display='none'" />` : ''}
          <div style="font-size:0.75rem;color:#6b7280;margin-bottom:6px;">${new Date(n.created_at).toLocaleString()} • ${escapeHtml(n.author)}</div>
          <h3 style="margin:0 0 8px; color:#f8fafc;">${escapeHtml(n.title)}</h3>
          <p style="margin:0;color:#d1d5db;white-space:pre-wrap;">${escapeHtml(n.content)}</p>
        </div>
      `;
    }
  }

  html += `</section>`;
  mainContent.innerHTML = html;

  // Setup event listeners
  const toggleBtn = document.getElementById('toggle-news-form');
  const formWrap = document.getElementById('news-form-wrap');
  if (toggleBtn && formWrap) {
    toggleBtn.addEventListener('click', () => {
      formWrap.style.display = formWrap.style.display === 'none' ? 'block' : 'none';
    });
  }

  const submitBtn = document.getElementById('news-submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const title = document.getElementById('news-title-input').value.trim();
      const text = document.getElementById('news-text-input').value.trim();
      const image = document.getElementById('news-image-input').value.trim();
      if (!title || !text) { showToast('Заголовок и текст обязательны.'); return; }
      
      const res = await addNews(title, text, image);
      if (!res.ok) {
        showToast('Ошибка: ' + res.error);
        return;
      }
      
      document.getElementById('news-title-input').value = "";
      document.getElementById('news-text-input').value = "";
      document.getElementById('news-image-input').value = "";
      formWrap.style.display = 'none';
      await renderHomeViewAsync();
      showToast('Новость опубликована!');
    });
  }

  document.querySelectorAll('.delete-news-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-news-id'));
      if (!window.confirm('Удалить новость?')) return;
      const res = await deleteNews(id);
      if (!res.ok) {
        showToast('Ошибка удаления');
        return;
      }
      await renderHomeViewAsync();
      showToast('Новость удалена.');
    });
  });
}

async function renderTreasuryViewAsync() {
  const isPrivileged = hasRole(ROLES.OWNER, ROLES.ADMIN);
  const t = await getTreasury();
  const pct = t.goal > 0 ? Math.min(100, Math.round((t.current / t.goal) * 100)) : 0;

  const formatMoney = (n) => Number(n).toLocaleString('ru-RU') + ' $';

  let barColor = '#3b82f6';
  if (pct >= 100) barColor = '#10b981';
  else if (pct >= 60) barColor = '#f59e0b';

  let html = `
    <section class="view view-treasury">
      <h2>Общак семьи</h2>
      <p class="text-muted">Совместная копилка семьи на общую цель.</p>
  `;

  if (!t.title && !t.goal) {
    html += `<div class="notice notice--info">Цель ещё не задана. Администрация скоро её установит.</div>`;
  } else {
    html += `
      <div class="card" style="border: 1px solid #1e293b; padding: 0; overflow: hidden;">
        ${t.image ? `<img src="${escapeHtml(t.image)}" alt="Фото цели" style="width:100%; max-height:320px; object-fit:cover;" onerror="this.style.display='none'" />` : ''}
        <div style="padding: 20px;">
          <h3 style="margin: 0 0 6px; font-size:1.4rem; color:#f8fafc;">Цель: ${escapeHtml(t.title)}</h3>
          ${t.description ? `<p style="color:#9ca3af; margin: 0 0 16px;">${escapeHtml(t.description)}</p>` : ''}
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="color:#d1d5db;">Собрано: <strong style="color:#f8fafc;">${formatMoney(t.current)}</strong></span>
            <span style="color:#d1d5db;">Цель: <strong style="color:#f8fafc;">${formatMoney(t.goal)}</strong></span>
          </div>
          <div style="background:#1e293b; border-radius:999px; height:20px; overflow:hidden; margin-bottom:8px;">
            <div style="width:${pct}%; background: linear-gradient(90deg, ${barColor}, ${barColor}cc); height:100%; border-radius:999px; transition: width 0.8s ease; display:flex; align-items:center; justify-content:center;">
              ${pct > 10 ? `<span style="font-size:0.75rem; font-weight:bold; color:#fff;">${pct}%</span>` : ''}
            </div>
          </div>
          ${pct <= 10 ? `<div style="text-align:right; font-size:0.8rem; color:#6b7280;">${pct}%</div>` : ''}
          ${pct >= 100 ? `<div class="notice notice--info" style="margin-top:12px;">Цель достигнута! Семья молодцы! 🎉</div>` : ''}
        </div>
      </div>
    `;
  }

  if (isPrivileged) {
    html += `
      <div class="card" style="margin-top:16px; border: 1px solid #334155;">
        <h3 style="margin-top:0;">⚙️ Управление общаком</h3>
        <div class="form__group"><label>Название цели</label><input type="text" id="t-title" value="${escapeHtml(t.title || '')}" placeholder="Например: Особняк на Вайнвуде" /></div>
        <div class="form__group"><label>Описание</label><input type="text" id="t-desc" value="${escapeHtml(t.description || '')}" placeholder="Краткое описание..." /></div>
        <div class="form__group"><label>Фото (ссылка на картинку)</label><input type="url" id="t-image" value="${escapeHtml(t.image || '')}" placeholder="https://..." /></div>
        <div class="form__group"><label>Сумма цели ($)</label><input type="number" id="t-goal" value="${t.goal || ''}" placeholder="10000000" min="1" /></div>
        <div class="form__group"><label>Текущая сумма ($)</label><input type="number" id="t-current" value="${t.current || ''}" placeholder="0" min="0" /></div>
        <div style="display:flex;gap:10px;">
          <button class="btn btn--primary" id="t-save-btn">Сохранить цель</button>
          <button class="btn btn--primary" id="t-update-btn" style="background:#10b981;border-color:#10b981;">Обновить сумму</button>
        </div>
      </div>
    `;
  }

  html += `</section>`;
  mainContent.innerHTML = html;

  const saveBtn = document.getElementById('t-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const title = document.getElementById('t-title').value.trim();
      const desc = document.getElementById('t-desc').value.trim();
      const image = document.getElementById('t-image').value.trim();
      const goal = Number(document.getElementById('t-goal').value);
      const current = Number(document.getElementById('t-current').value);
      if (!title || !goal) { showToast('Название и цель обязательны.'); return; }
      await saveTreasury({ title, description: desc, image, goal, current });
      await renderTreasuryViewAsync();
      showToast('Цель обновлена!');
    });
  }

  const updateBtn = document.getElementById('t-update-btn');
  if (updateBtn) {
    updateBtn.addEventListener('click', async () => {
      const current = Number(document.getElementById('t-current').value);
      await saveTreasury({ ...t, current });
      await renderTreasuryViewAsync();
      showToast('Сумма обновлена!');
    });
  }
}

async function renderEventsViewAsync() {
  const login = getCurrentLogin();
  const isPrivileged = hasRole(ROLES.OWNER, ROLES.ADMIN);
  const events = (await getEvents()).slice().reverse();

  let html = `
    <section class="view view-events">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
        <h2 style="margin:0;">События</h2>
        ${isPrivileged ? '<button class="btn btn--primary" id="ev-create-btn" style="padding:6px 14px;">+ Новое событие</button>' : ''}
      </div>
  `;

  if (isPrivileged) {
    html += `
      <div id="ev-form-wrap" style="display:none; margin-bottom:20px;">
        <div class="card" style="border: 1px solid #3b82f6;">
          <h3 style="margin-top:0;">Создать событие</h3>
          <div class="form__group"><label>Название</label><input type="text" id="ev-title" placeholder="Название события..." /></div>
          <div class="form__group"><label>Дата</label><input type="datetime-local" id="ev-date" /></div>
          <div class="form__group"><label>Описание</label><textarea id="ev-desc" placeholder="Описание события..."></textarea></div>
          <button class="btn btn--primary" id="ev-submit">Создать</button>
        </div>
      </div>
    `;
  }

  if (events.length === 0) {
    html += `<div class="notice notice--info">Событий пока нет.</div>`;
  } else {
    for (const e of events) {
      const dateStr = new Date(e.event_date).toLocaleString();
      html += `
        <div class="card" style="margin-bottom:16px;">
          ${isPrivileged ? `<button class="btn btn--ghost delete-event-btn" data-ev-id="${e.id}" style="float:right;padding:3px 8px;font-size:0.75rem;">×</button>` : ''}
          <h3 style="margin:0 0 6px;">${escapeHtml(e.title)}</h3>
          <div style="color:#9ca3af; font-size:0.9rem; margin-bottom:8px;">📅 ${dateStr}</div>
          <p style="margin:0;color:#d1d5db;">${escapeHtml(e.description)}</p>
        </div>
      `;
    }
  }

  html += `</section>`;
  mainContent.innerHTML = html;

  const createBtn = document.getElementById('ev-create-btn');
  const formWrap = document.getElementById('ev-form-wrap');
  if (createBtn && formWrap) {
    createBtn.addEventListener('click', () => {
      formWrap.style.display = formWrap.style.display === 'none' ? 'block' : 'none';
    });
  }

  const submitBtn = document.getElementById('ev-submit');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const title = document.getElementById('ev-title').value.trim();
      const eventDate = document.getElementById('ev-date').value;
      const description = document.getElementById('ev-desc').value.trim();
      if (!title) { showToast('Название обязательно.'); return; }
      const res = await addEvent(title, description, eventDate);
      if (!res.ok) {
        showToast('Ошибка: ' + res.error);
        return;
      }
      document.getElementById('ev-title').value = "";
      document.getElementById('ev-date').value = "";
      document.getElementById('ev-desc').value = "";
      formWrap.style.display = 'none';
      await renderEventsViewAsync();
      showToast('Событие создано!');
    });
  }

  document.querySelectorAll('.delete-event-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-ev-id'));
      if (!window.confirm('Удалить событие?')) return;
      const res = await deleteEvent(id);
      if (!res.ok) {
        showToast('Ошибка удаления');
        return;
      }
      await renderEventsViewAsync();
      showToast('Событие удалено.');
    });
  });
}

async function renderComplaintsViewAsync() {
  const login = getCurrentLogin();
  const isOwner = hasRole(ROLES.OWNER);
  
  const currentUser = login ? { login } : null;
  const isPrivileged = hasRole(ROLES.OWNER, ROLES.ADMIN, ROLES.UNION_LEADER, ROLES.UNION_DEPUTY);
  const canWrite = isPrivileged || (currentUser && currentUser.canWriteTopics === true);
  const complaints = (await getComplaints()).slice().reverse();

  let html = `
    <section class="view view-complaints">
      <h2>Жалобы</h2>
  `;

  if (!login) {
    html += `<div class="notice notice--warning">Требуется вход в систему для просмотра жалоб.</div>`;
  } else if (!canWrite) {
    html += `
      <div class="notice notice--warning">
        У вас нет доступа для создания жалоб. Попросите администратора открыть доступ.
      </div>
    `;
  }

  if (canWrite) {
    html += `
      <div class="card" style="margin-bottom:20px; border: 1px solid #f59e0b;">
        <h3 style="margin-top:0;">Написать жалобу</h3>
        <div class="form__group"><label>Заголовок</label><input type="text" id="complaint-title" placeholder="Кратко о проблеме..." /></div>
        <div class="form__group"><label>Описание</label><textarea id="complaint-text" placeholder="Подробное описание..."></textarea></div>
        <button class="btn btn--primary" id="complaint-submit-btn">Отправить жалобу</button>
      </div>
    `;
  }

  if (complaints.length === 0) {
    html += `<div class="notice notice--info">Жалоб пока нет.</div>`;
  } else {
    for (const c of complaints) {
      html += `
        <div class="card" style="margin-bottom:12px; border-left: 4px solid #ef4444; position:relative;">
          ${isOwner ? `<button class="btn btn--ghost delete-complaint-btn" data-id="${c.id}" style="position:absolute;top:10px;right:10px;padding:3px 8px;font-size:0.75rem;">×</button>` : ''}
          <div style="font-size:0.75rem;color:#6b7280;margin-bottom:6px;">${new Date(c.created_at).toLocaleString()} • ${escapeHtml(c.author)}</div>
          <h4 style="margin:0 0 8px;">${escapeHtml(c.title)}</h4>
          <p style="margin:0;color:#d1d5db;">${escapeHtml(c.content)}</p>
          <div style="margin-top:8px;font-size:0.8rem;color:#6b7280;">Статус: <strong>${c.status === 'resolved' ? '✓ Решена' : '⏳ Открыта'}</strong></div>
        </div>
      `;
    }
  }

  html += `</section>`;
  mainContent.innerHTML = html;

  const submitBtn = document.getElementById('complaint-submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const title = document.getElementById('complaint-title').value.trim();
      const text = document.getElementById('complaint-text').value.trim();
      if (!title || !text) { showToast('Заголовок и описание обязательны.'); return; }
      
      const res = await addComplaint(title, text);
      if (!res.ok) {
        showToast('Ошибка: ' + res.error);
        return;
      }
      
      document.getElementById('complaint-title').value = "";
      document.getElementById('complaint-text').value = "";
      await renderComplaintsViewAsync();
      showToast('Жалоба отправлена!');
    });
  }

  document.querySelectorAll('.delete-complaint-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-id'));
      if (!window.confirm('Удалить жалобу?')) return;
      const res = await deleteComplaint(id);
      if (!res.ok) {
        showToast('Ошибка удаления');
        return;
      }
      await renderComplaintsViewAsync();
      showToast('Жалоба удалена.');
    });
  });
}
