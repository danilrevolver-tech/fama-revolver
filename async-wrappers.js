// Async wrappers for remaining render functions

async function renderUnionForumViewAsync() {
  const login = getCurrentLogin();
  const isOwner = hasRole(ROLES.OWNER);
  const canWriteUnionForum = hasRole(
    ROLES.OWNER,
    ROLES.UNION_LEADER,
    ROLES.UNION_DEPUTY,
    ROLES.ADMIN
  );
  
  let html = `
    <section class="view view-union-forum">
      <h2>Форум союзов</h2>
      <p class="text-muted">Отдельный форум, посвящённый взаимодействию с союзами.</p>
      <div class="tabs" id="union-forum-tabs">
        ${UNION_FORUM_TOPICS.map(
          (t) => `
            <button class="tab ${t.id === activeUnionForumTopic ? "tab--active" : ""}" data-topic="${
            t.id
          }">${t.label}</button>
          `
        ).join("")}
      </div>
      <div class="tab-content" id="union-forum-content"></div>
    </section>
  `;

  mainContent.innerHTML = html;

  document.querySelectorAll("#union-forum-tabs .tab").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const topic = btn.getAttribute("data-topic");
      activeUnionForumTopic = topic;
      await renderUnionForumViewAsync();
    });
  });

  const container = document.getElementById("union-forum-content");
  const topicDef = UNION_FORUM_TOPICS.find((t) => t.id === activeUnionForumTopic);
  const title = topicDef ? topicDef.label : "Тема";

  const allPosts = (await getUnionForumPosts()).filter((p) => p.topic === activeUnionForumTopic);
  const posts = allPosts.slice().reverse();

  let inner = `<h3>${title}</h3>`;

  if (!login) {
    inner += requireAuthNotice();
  } else if (!canWriteUnionForum) {
    inner += `
      <div class="notice notice--warning">
        Писать в форум союзов могут только роли: глава союзов, заместитель союзов, admin и owner.
      </div>
    `;
  } else {
    inner += `
      <form class="form" id="union-forum-form">
        <div class="form__group">
          <label>Имя</label>
          <input type="text" id="union-forum-name" value="${login}" disabled />
        </div>
        <div class="form__group">
          <label>Сообщение</label>
          <textarea id="union-forum-message" placeholder="Напишите сообщение по теме '${title.toLowerCase()}'..."></textarea>
        </div>
        <div class="form__error" id="union-forum-error"></div>
        <button type="submit" class="btn btn--primary">Отправить</button>
      </form>
    `;
  }

  inner += `<div class="list" id="union-forum-messages">`;
  if (posts.length === 0) {
    inner += `<div class="text-muted">Сообщений в этой теме пока нет.</div>`;
  } else {
    for (const p of posts) {
      inner += `
        <div class="list-item">
          <div class="list-item__meta" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span>${escapeHtml(p.author)} • ${new Date(p.created_at).toLocaleString()}</span>
            ${
              isOwner
                ? `<button class="btn btn--ghost delete-union-forum-post-btn" data-post-id="${p.id}" style="padding:4px 10px;font-size:0.8rem;">Удалить</button>`
                : ""
            }
          </div>
          <div class="list-item__text">${escapeHtml(p.content)}</div>
        </div>
      `;
    }
  }
  inner += `</div>`;

  container.innerHTML = inner;

  if (login && canWriteUnionForum) {
    const form = document.getElementById("union-forum-form");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = document.getElementById("union-forum-message").value.trim();
        if (!text) return;

        const res = await addUnionForumPost(activeUnionForumTopic, text);
        if (!res.ok) {
          document.getElementById("union-forum-error").textContent = "Ошибка отправки";
          return;
        }

        document.getElementById("union-forum-message").value = "";
        await renderUnionForumViewAsync();
        showToast("Сообщение отправлено.");
      });
    }
  }

  if (isOwner) {
    document.querySelectorAll(".delete-union-forum-post-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.getAttribute("data-post-id"));
        if (!id) return;
        if (!window.confirm("Удалить сообщение из форума союзов?")) return;

        const res = await deleteUnionForumPost(id);
        if (!res.ok) {
          showToast("Ошибка удаления");
          return;
        }

        await renderUnionForumViewAsync();
        showToast("Сообщение удалено.");
      });
    });
  }
}

async function renderMarketViewAsync() {
  const login = getCurrentLogin();
  const isOwner = hasRole(ROLES.OWNER);
  const posts = (await getMarketPosts()).slice().reverse();

  let html = `
    <section class="view view-market">
      <h2>Рынок</h2>
      <p class="text-muted">Объявления от участников семьи.</p>
  `;

  if (!login) {
    html += requireAuthNotice();
  } else {
    html += `
      <form class="form" id="market-form">
        <div class="form__group">
          <label>Имя</label>
          <input type="text" id="market-name" value="${login}" disabled />
        </div>
        <div class="form__group">
          <label>Заголовок</label>
          <input type="text" id="market-title" placeholder="Краткое название..." />
        </div>
        <div class="form__group">
          <label>Описание</label>
          <textarea id="market-message" placeholder="Опишите ваше предложение..."></textarea>
        </div>
        <div class="form__error" id="market-error"></div>
        <button type="submit" class="btn btn--primary">Опубликовать</button>
      </form>
    `;
  }

  html += `<div class="list" id="market-posts">`;

  if (posts.length === 0) {
    html += `<div class="text-muted">Объявлений пока нет.</div>`;
  } else {
    for (const p of posts) {
      html += `
        <div class="list-item">
          <div class="list-item__meta">${escapeHtml(p.author)} • ${new Date(p.created_at).toLocaleString()}</div>
          <div class="list-item__text">
            <strong>${escapeHtml(p.title)}</strong><br />
            ${escapeHtml(p.content)}
          </div>
          ${isOwner ? `<button class="btn btn--ghost delete-market-btn" data-id="${p.id}" style="padding:4px 10px;font-size:0.8rem;">Удалить</button>` : ""}
        </div>
      `;
    }
  }

  html += `</div></section>`;
  mainContent.innerHTML = html;

  const form = document.getElementById("market-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = document.getElementById("market-title").value.trim();
      const content = document.getElementById("market-message").value.trim();
      if (!title || !content) {
        document.getElementById("market-error").textContent = "Заполните все поля";
        return;
      }

      const res = await addMarketPost(title, content);
      if (!res.ok) {
        document.getElementById("market-error").textContent = "Ошибка: " + res.error;
        return;
      }

      document.getElementById("market-title").value = "";
      document.getElementById("market-message").value = "";
      await renderMarketViewAsync();
      showToast("Объявление опубликовано!");
    });
  }

  document.querySelectorAll(".delete-market-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-id"));
      if (!window.confirm("Удалить объявление?")) return;

      const res = await deleteMarketPost(id);
      if (!res.ok) {
        showToast("Ошибка удаления");
        return;
      }

      await renderMarketViewAsync();
      showToast("Объявление удалено.");
    });
  });
}

async function renderMessagesViewAsync() {
  const login = getCurrentLogin();
  const messages = await getMessages();

  let html = `
    <section class="view view-messages">
      <h2>Личные сообщения</h2>
  `;

  if (!login) {
    html += requireAuthNotice();
  } else {
    html += `
      <div class="card" style="margin-bottom:20px;">
        <h3 style="margin-top:0;">Отправить сообщение</h3>
        <div class="form__group">
          <label>Кому (логин)</label>
          <input type="text" id="msg-to" placeholder="Логин получателя..." />
        </div>
        <div class="form__group">
          <label>Сообщение</label>
          <textarea id="msg-text" placeholder="Текст сообщения..."></textarea>
        </div>
        <div class="form__error" id="msg-error"></div>
        <button class="btn btn--primary" id="msg-send-btn">Отправить</button>
      </div>
    `;
  }

  if (messages.length === 0) {
    html += `<div class="notice notice--info">Сообщений пока нет.</div>`;
  } else {
    html += `<div class="list">`;
    const sorted = messages.slice().reverse();
    for (const m of sorted) {
      const isIncoming = m.to === login;
      const otherUser = isIncoming ? m.from : m.to;
      html += `
        <div class="list-item" style="border-left: 4px solid ${isIncoming ? '#3b82f6' : '#10b981'};">
          <div class="list-item__meta">${isIncoming ? '← От' : '→ Кому'}: <strong>${escapeHtml(otherUser)}</strong> • ${new Date(m.created_at).toLocaleString()}</div>
          <div class="list-item__text">${escapeHtml(m.text)}</div>
        </div>
      `;
    }
    html += `</div>`;
  }

  html += `</section>`;
  mainContent.innerHTML = html;

  const sendBtn = document.getElementById("msg-send-btn");
  if (sendBtn) {
    sendBtn.addEventListener("click", async () => {
      const to = document.getElementById("msg-to").value.trim();
      const text = document.getElementById("msg-text").value.trim();
      if (!to || !text) {
        document.getElementById("msg-error").textContent = "Заполните все поля";
        return;
      }

      const res = await addMessage(to, text);
      if (!res.ok) {
        document.getElementById("msg-error").textContent = "Ошибка: " + res.error;
        return;
      }

      document.getElementById("msg-to").value = "";
      document.getElementById("msg-text").value = "";
      await renderMessagesViewAsync();
      showToast("Сообщение отправлено!");
    });
  }
}
