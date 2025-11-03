require("dotenv").config();
const { Telegraf } = require("telegraf");
const fs = require("fs-extra");
const ffmpeg = require("fluent-ffmpeg");

// В Node 18+ fetch встроен
const fetch = global.fetch;

// Проверяем токен
if (!process.env.BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is missing. Add it to .env or Render env vars.");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) =>
  ctx.reply("Привет! Пришли обычное видео — сделаю из него кружок 🎥")
);

// 🔹 Обработка видео
bot.on("video", async (ctx) => {
  const chatId = ctx.chat.id;
  console.log(`➡️ Видео получено от ${chatId}`);

  const inputFile = `./temp_input_${Date.now()}.mp4`;
  const outputFile = `./temp_output_${Date.now()}.mp4`;

  try {
    // Сообщение ожидания
    const waitMsg = await ctx.reply("🎬 Обрабатываю видео, немного подожди...");

    // 1️⃣ Получаем URL видео
    const fileId = ctx.message.video.file_id;
    const fileInfo = await ctx.telegram.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;

    // 2️⃣ Скачиваем видео
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`Не удалось скачать видео: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(inputFile, buffer);

    // 3️⃣ Обработка через ffmpeg с прогрессом
    await new Promise((resolve, reject) => {
      let lastPercent = 0;

      ffmpeg(inputFile)
        .setDuration(60) // максимум 60 секунд
        .videoFilter("crop=min(iw\\,ih):min(iw\\,ih),scale=512:512")
        .outputOptions([
          "-c:v libx264",
          "-crf 23",
          "-preset superfast", // быстро, без потери качества
          "-c:a aac",
          "-b:a 128k",
          "-movflags +faststart",
          "-pix_fmt yuv420p",
        ])
        .on("progress", async (progress) => {
          const percent = Math.floor(progress.percent || 0);
          if (percent - lastPercent >= 10 && percent < 100) {
            lastPercent = percent;
            try {
              await ctx.telegram.editMessageText(
                chatId,
                waitMsg.message_id,
                undefined,
                `⏳ Обработка: ${percent}%`
              );
            } catch {}
          }
        })
        .on("end", resolve)
        .on("error", reject)
        .save(outputFile);
    });

    // 4️⃣ Отправляем как кружочек
    await ctx.replyWithVideoNote({ source: outputFile });
    await ctx.reply("✅ Готово! Кружочек со звуком отправлен 😎");

    console.log(`✅ Кружочек успешно отправлен пользователю ${chatId}`);
  } catch (err) {
    console.error("❌ Ошибка при обработке:", err);
    await ctx.reply(`❌ Что-то пошло не так: ${err?.message || err}`);
  } finally {
    try {
      await fs.remove(inputFile);
    } catch {}
    try {
      await fs.remove(outputFile);
    } catch {}
  }
});

// 🔹 Уже кружок
bot.on("video_note", async (ctx) => {
  await ctx.reply("Это уже кружочек 😎");
});

// 🔹 Запуск с перезапуском при 409
bot
  .launch()
  .then(() => console.log("🤖 Бот запущен и ждёт видео!"))
  .catch((err) => {
    console.error("Ошибка запуска бота:", err.message);
    if (err.message.includes("409")) {
      console.log(
        "⚠️ Найден другой активный экземпляр бота. Перезапуск через 30 секунд..."
      );
      setTimeout(() => process.exit(1), 30000);
    } else {
      process.exit(1);
    }
  });

// --- HTTP сервер для Render (антиусыпление) ---
const http = require("http");
http
  .createServer((req, res) => {
    console.log("PING / — uptime check");
    res.write("Bot is running");
    res.end();
  })
  .listen(process.env.PORT || 10000);

// --- Keep-alive лог каждые 14 минут ---
setInterval(() => console.log("🟢 Keep-alive ping..."), 14 * 60 * 1000);
