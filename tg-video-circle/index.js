require("dotenv").config();
const { Telegraf } = require("telegraf");
const fs = require("fs-extra");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");

// ✅ Указываем путь к бинарнику ffmpeg
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
console.log("🧩 ffmpeg path:", ffmpegInstaller.path);

const http = require("http");
const fetch = global.fetch;

// --- Проверяем наличие токена ---
if (!process.env.BOT_TOKEN) {
  console.error(
    "❌ BOT_TOKEN отсутствует. Добавь его в Render Environment Variables."
  );
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// Стартовое сообщение
bot.start((ctx) =>
  ctx.reply("👋 Привет! Пришли мне видео — сделаю из него кружок со звуком 🎥")
);

// --- Обработка обычного видео ---
bot.on("video", async (ctx) => {
  const chatId = ctx.chat.id;
  console.log(`➡️ Видео получено от пользователя ${chatId}`);

  const inputFile = `./temp_input_${Date.now()}.mp4`;
  const outputFile = `./temp_output_${Date.now()}.mp4`;

  try {
    const waitMsg = await ctx.reply("🎬 Обрабатываю видео, немного подожди...");

    // 1️⃣ Получаем URL видео
    const fileId = ctx.message.video.file_id;
    const fileInfo = await ctx.telegram.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;

    // 2️⃣ Скачиваем видео во временный файл
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`Не удалось скачать видео: ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(inputFile, buf);

    // 3️⃣ Конвертируем: квадрат 1:1, ≤60 сек, звук сохраняем
    await new Promise((resolve, reject) => {
      let lastPercent = 0;
      ffmpeg(inputFile)
        .setDuration(60)
        .videoFilter("crop=min(iw\\,ih):min(iw\\,ih),scale=512:512")
        .outputOptions([
          "-c:v libx264",
          "-crf 23",
          "-preset superfast",
          "-c:a aac",
          "-b:a 128k",
          "-movflags +faststart",
          "-pix_fmt yuv420p",
        ])
        .on("progress", async (p) => {
          const percent = Math.floor(p.percent || 0);
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

    // 4️⃣ Отправляем кружок
    await ctx.replyWithVideoNote({ source: outputFile });
    await ctx.reply("✅ Готово! Кружочек со звуком отправлен 😎");

    console.log(`✅ Видео успешно обработано для ${chatId}`);
  } catch (err) {
    console.error("❌ Ошибка при обработке:", err);
    await ctx.reply(`❌ Что-то пошло не так: ${err?.message || err}`);
  } finally {
    await fs.remove(inputFile).catch(() => {});
    await fs.remove(outputFile).catch(() => {});
  }
});

// --- Уже кружок ---
bot.on("video_note", async (ctx) => ctx.reply("Это уже кружочек 😎"));

// --- Запуск бота ---
bot
  .launch()
  .then(() => console.log("🤖 Бот запущен на Render и ждёт видео!"))
  .catch((err) => {
    console.error("Ошибка запуска бота:", err.message);
    if (err.message.includes("409")) {
      console.log(
        "⚠️ Найден другой активный экземпляр. Ждём, пока Render оставит один..."
      );
    }
  });

// --- HTTP-сервер для Render Free (чтобы сервис не засыпал) ---
http
  .createServer((req, res) => {
    console.log("PING / — uptime check");
    res.write("Bot is running");
    res.end();
  })
  .listen(process.env.PORT || 10000);

// --- Keep-alive каждые 14 мин ---
setInterval(() => console.log("🟢 Keep-alive ping..."), 14 * 60 * 1000);
