# Миграция Localhost → Supabase

## 🎯 Шаг 1: Создать таблицы в Supabase

1. Откройте [https://app.supabase.com](https://app.supabase.com)
2. Перейдите в **SQL Editor**
3. Создайте новый запрос и скопируйте содержимое из файла **supabase-schema.sql**
4. Выполните запрос

## 🔑 Шаг 2: Настроить Supabase Auth

1. В Supabase перейдите в **Authentication** → **Providers**
2. Убедитесь, что **Email** включён
3. Перейдите в **Settings** → **Auth**
4. Установите **Confirm email required:** OFF (для теста) или ON (для продакшена)

## 📝 Шаг 3: Обновить index.html

В `<head>` добавьте скрипт Supabase (если его нет):
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

Убедитесь, что он стоит **ДО** вашего app.js:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="app.js"></script>
```

## 🚀 Шаг 4: Выбрать подход к разработке

### Вариант A: Полная замена app.js (рекомендуется)
- Скопируйте содержимое из **app-supabase-migration.js**
- Замените содержимое **app.js**
- Это новая версия со встроенной Supabase auth

### Вариант B: Постепенная миграция
- Оставьте текущий app.js
- Добавьте функции Supabase параллельно
- Постепенно мигрируйте каждый раздел

## 📊 Ключевые изменения

### Аутентификация

**Было (localStorage):**
```javascript
function loginUser(login, password) {
  const user = findUser(login);
  if (user.passwordHash !== hashPassword(password)) return { ok: false };
  setSession({ login: user.login, role: user.role });
  return { ok: true };
}
```

**Стало (Supabase):**
```javascript
async function loginUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
```

### Чтение данных

**Было:**
```javascript
function getNews() { 
  return readJson(STORAGE_KEYS.NEWS, []); 
}
```

**Стало:**
```javascript
async function getNews() {
  const { data, error } = await supabase
    .from("news")
    .select("*")
    .order("created_at", { ascending: false });
  return error ? [] : (data || []);
}
```

### Добавление данных

**Было:**
```javascript
const list = getNews();
list.push({ id: Date.now(), title, text, ... });
saveNews(list);
```

**Стало:**
```javascript
const { error } = await supabase
  .from("news")
  .insert({
    id: Date.now().toString(),
    title,
    description: text,
    ...
  });
```

## 🔐 Безопасность

### Row Level Security (RLS)
- Все таблицы имеют RLS политики
- Читать могут все (SELECT)
- Писать могут только авторизованные (INSERT, UPDATE)
- Удалять могут только владельцы (автор или администратор)

### Конфиденциальные данные
- **НИКОГДА** не коммитьте ключи в Git
- Используйте переменные окружения в production
- Для Netlify: используйте Netlify Environment Variables

## 📱 URL функцииих обновлений

Если используете Netlify Functions, обновите адреса:

**Было:**
```javascript
fetch('/.netlify/functions/send-code', { ... })
```

**Стало:**
```javascript
fetch('/.netlify/functions/send-code', { ... })
// Осталось то же, работает с Supabase
```

## ✅ Чек-лист перед запуском

- [ ] Таблицы созданы в Supabase
- [ ] Auth включена в Supabase
- [ ] app.js обновлен
- [ ] `<script src="supabase-js">` добавлен в index.html
- [ ] Встроенные ключи Supabase указаны
- [ ] Протестирована регистрация
- [ ] Протестирован вход
- [ ] Протестировано добавление новости/события
- [ ] Проверены RLS политики

## 🐛 Решение проблем

### "supabase is not defined"
```javascript
// Убедитесь, что в index.html стоит перед app.js:
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="app.js"></script>
```

### "No rows returned" при чтении
```javascript
// Убедитесь, что таблицы созданы
// Проверьте RLS политики (они должны разрешать SELECT)
```

### Auth не работает
1. Проверьте SUPABASE_URL и SUPABASE_KEY
2. Убедитесь, что Email provider включен
3. Проверьте консоль браузера на ошибки

## 🔄 Миграция существующих данных

Если у вас уже есть данные в localStorage:

```javascript
// 1. Экспортируйте из localStorage
const oldNews = JSON.parse(localStorage.getItem('revolver_news'));

// 2. Конвертируйте в формат Supabase
const newNews = oldNews.map(n => ({
  id: n.id.toString(),
  title: n.title,
  description: n.text,
  image: n.image,
  timestamp: new Date(n.date).getTime()
}));

// 3. Загрузите в Supabase
await supabase.from('news').insert(newNews);
```

## 📚 Полезные ссылки

- [Supabase документация](https://supabase.com/docs)
- [JS клиент](https://supabase.com/docs/reference/javascript)
- [Auth](https://supabase.com/docs/guides/auth)
- [Database](https://supabase.com/docs/guides/database)
- [RLS Policies](https://supabase.com/docs/guides/auth/row-level-security)
