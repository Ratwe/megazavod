# ZAVOD — «Немой лифт»

Сюжетный MVP браузерной игры для Telegram Mini Apps и обычного браузера. Игрок исследует остановку грузового лифта: выполняет доступные из текущих фактов работы, публикует общие результаты, участвует в 24-часовом Заводском вече и приводит эпизод к одной из трёх авторских развязок.

Опубликованный клиент: <https://ratwe.github.io/megazavod/>. Если для сборки Pages не задан `VITE_STORY_API_URL`, клиент честно запускается как локальная демонстрация: её прогресс существует только в текущем браузере.

## Локальный запуск

Нужен Node.js 22 или новее.

```bash
npm ci
npm run dev:api
```

Во втором терминале:

```bash
VITE_STORY_API_URL=http://localhost:8787 npm run dev
```

Откройте `http://localhost:5173/?player=alice&name=Алиса`. Для второго игрока используйте другой браузер или `?player=boris&name=Борис`. Заголовки тестовой личности разрешены только при `ALLOW_DEV_AUTH=true` и никогда не принимаются в production.

## Проверки

```bash
npm test
npm run build
```

Тесты проверяют двух клиентов в общем мире, идемпотентность действий, замену голоса, границу ровно в 24 часа, безопасный исход при ничьей, три сюжетные ветки и восстановление SQLite после перезапуска.

## Production

API хранит общий мир в SQLite. Обязательные переменные:

```dotenv
NODE_ENV=production
PORT=8787
DATABASE_PATH=/data/zavod.db
TELEGRAM_BOT_TOKEN=token-from-botfather
ALLOWED_ORIGINS=https://ratwe.github.io
```

Соберите и запустите API через `Dockerfile`, подключив постоянный том к `/data`. В GitHub Actions добавьте repository variable `STORY_API_URL` с HTTPS-адресом API; workflow передаст его клиентской сборке как `VITE_STORY_API_URL`. Токен Telegram остаётся только на сервере.

Для Mini App укажите `https://ratwe.github.io/megazavod/` в `@BotFather`. API проверяет подпись `Telegram.WebApp.initData` и срок её действия.

Архитектура, модель данных, правила расширения истории и прохождение трёх веток описаны в [docs/STORY_MVP.md](docs/STORY_MVP.md).
