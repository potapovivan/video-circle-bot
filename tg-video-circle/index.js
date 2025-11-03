require("dotenv").config();
const { Telegraf } = require("telegraf");
const fs = require("fs-extra");
const ffmpeg = require("fluent-ffmpeg");
const http = require("http");

const fetch = global.fetch;

// Проверяем наличие токена
if (!process.env.BOT_TOKEN) {
  console.error("❌ BOT_TOKEN отсутствует. Добавь его в Railway Environment Variables.");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) =>
  ctx.reply("👋 Пришли мне видео — я сделаю из него кружок со звуком 🎥 (максимум 60 секунд)")
);

// Обработка обычного видео
bot.on("video", async (ctx) => {
  const chatId = ctx.chat.id;
  console.log(`➡️ Видео получено от пользователя ${chatId}`);

  const inputFile = `./temp_input_${Date.now()}.mp4`;
  const outputFile = `./temp_output_${Date.now()}.mp4`;

  try {
    await ctx.reply("🎬 Обрабатываю видео, немного подожди…");

    // 1️⃣ Получаем прямой URL файла
    const fileId = ctx.message.video.file_id;
    const fileInfo = await ctx.telegram.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;

    // 2️⃣ Скачиваем во временный файл
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`Ошибка загрузки видео: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(inputFile, buf);

    // 3️⃣ Конвертируем в квадрат 512×512, обрезаем до 60 сек, сохраняем звук и качество
    await new Promise((resolve, reject) => {
      ffmpeg(inputFile)
        .setDuration(60)
        .videoFilter("crop=min(iw\\,ih):min(iw\\,ih),scale=512:512")
        .outputOptions([
          "-c:v libx264",
          "-crf 18",          // высокое качество (чем меньше, тем лучше)
          "-preset ultrafast", // скорость кодирования
          "-c:a aac",          // звук
          "-b:a 128k",         // битрейт звука
          "-pix_fmt yuv420p"
        ])
        .on("end", resolve)
        .on("error", reject)
        .save(outputFile);
    });

    // 4️⃣ Отправляем как кружочек
    await ctx.replyWithVideoNote({ source: outputFile });

    console.log(`✅ Кружочек успешно отправлен пользователю ${chatId}`);
  } catch (err) {
    console.error("❌ Ошибка при обработке:", err);
    await ctx.reply(`❌ Что-то пошло не так: ${err.message}`);
  } finally {
    try {
      await fs.remove(inputFile);
      await fs.remove(outputFile);
    } catch {}
  }
});

// Уже кружок
bot.on("video_note", async (ctx) => ctx.reply("Это уже кружочек 😎"));

// Запуск
bot
  .launch()
  .then(() => console.log("🤖 Бот запущен и ждёт видео!"))
  .catch((err) => {
    console.error("Ошибка запуска бота:", err.message);
    if (err.message.includes("409")) {
      console.log("⚠️ Найден другой активный экземпляр, перезапуск через 30 сек...");
      setTimeout(() => process.exit(1), 30000);
    } else {
      process.exit(1);
    }
  });

// HTTP сервер для Railway (keep-alive)
http
  .createServer((req, res) => {
    res.write("Bot is running");
    res.end();
  })
  .listen(process.env.PORT || 10000, () => {
    console.log("🌐 Railway web server started");
  });
