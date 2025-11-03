# Используем официальный Node-образ
FROM node:22-bullseye

# Устанавливаем ffmpeg и очищаем кэш apt
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Рабочая директория
WORKDIR /app

# Копируем проект
COPY . .

# Устанавливаем зависимости без dev-пакетов
RUN npm ci --omit=dev

# Запуск
CMD ["npm", "start"]
