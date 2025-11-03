require("dotenv").config();
const { Telegraf } = require("telegraf");
const fs = require("fs-extra");
const ffmpeg = require("fluent-ffmpeg");

// В Node 18+ fetch встроен
const fetch = global.fetch;

// Без указания локального пути к ffmpeg — на Render он системный
// (ничего не трогаем, не вызываем setFfmpegPath)

// Без токена — выходим сразу (и на локали, и на Render)
if (!process.env.BOT_TOKEN) {
  console.error(
    "❌ BOT_TOKEN is missing. Add it to .env locally or to Render env vars."
  );
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) =>
  ctx.reply("Привет! Пришли обычное видео — сделаю из него кружок 🎥")
);

// Обычное видео → скачиваем → квадрат 512×512, ≤60 сек → отправляем как video_note
bot.on("video", async (ctx) => {
  const chatId = ctx.chat.id;
  console.log(`➡️  Video received from chat ${chatId}`);

  const inputFile = `./temp_input_${Date.now()}.mp4`;
  const outputFile = `./temp_output_${Date.now()}.mp4`;

  try {
    await ctx.reply("🎬 Обрабатываю видео, немного подожди…");

    // 1) Получаем прямой URL файла
    const fileId = ctx.message.video.file_id;
    const fileInfo = await ctx.telegram.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;

    // 2) Скачиваем во временный файл
    const res = await fetch(fileUrl);
    if (!res.ok)
      throw new Error(`Failed to fetch file: ${res.status} ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(inputFile, buf);

    // 3) Конвертируем в квадрат и обрезаем до 60 сек
    await new Promise((resolve, reject) => {
      ffmpeg(inputFile)
        .setDuration(60)
        .videoFilter("crop=min(iw\\,ih):min(iw\\,ih),scale=512:512")
        .outputOptions(["-c:v libx264", "-preset veryfast", "-pix_fmt yuv420p"])
        .on("end", resolve)
        .on("error", reject)
        .save(outputFile);
    });

    // 4) Отправляем как кружок
    await ctx.replyWithVideoNote({ source: outputFile });

    console.log(`✅ Circle sent to chat ${chatId}`);
  } catch (err) {
    console.error("❌ Error during processing:", err);
    await ctx.reply(`❌ Что-то пошло не так: ${err?.message || err}`);
  } finally {
    // 5) Чистим временные файлы
    try {
      await fs.remove(inputFile);
    } catch {}
    try {
      await fs.remove(outputFile);
    } catch {}
  }
});

// Уже кружок
bot.on("video_note", async (ctx) => {
  await ctx.reply("Это уже кружочек 😎");
});

bot.launch().then(() => console.log("🤖 Бот запущен и ждёт видео!"));

// --- Фейковый HTTP-сервер для Render Free (чтобы «видел» открытый порт) ---
const http = require("http");
http
  .createServer((req, res) => {
    res.write("Bot is running");
    res.end();
  })
  .listen(process.env.PORT || 10000);
