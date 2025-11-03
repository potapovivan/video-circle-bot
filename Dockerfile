# === ЭТА ВЕРСИЯ ГАРАНТИРОВАННО УСТАНАВЛИВАЕТ FFMPEG ===
FROM node:22-bullseye

# Устанавливаем ffmpeg и очищаем кэш apt
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Рабочая директория
WORKDIR /app

# Копируем файлы проекта
COPY . .

# Устанавливаем зависимости без dev-пакетов
RUN npm ci --omit=dev

# Открываем порт (Railway ожидает 3000)
EXPOSE 3000

# Запуск бота
CMD ["node", "index.js"]
