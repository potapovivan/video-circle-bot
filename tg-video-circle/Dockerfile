# Базовый образ с Node.js
FROM node:22-slim

# Устанавливаем ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && apt-get clean

# Создаем рабочую директорию
WORKDIR /app

# Копируем package.json и устанавливаем зависимости
COPY package*.json ./
RUN npm install

# Копируем весь проект
COPY . .

# Запускаем бота
CMD ["node", "index.js"]
