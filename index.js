import express from "express";
import { Telegraf } from "telegraf";
import { spawn, execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const BOT_TOKEN = process.env.BOT_TOKEN;
const DOMAIN = process.env.RAILWAY_STATIC_URL;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN не задан. Добавь его в Railway → Variables.");
  process.exit(1);
}

// Проверяем наличие ffmpeg
try {
  execSync("ffmpeg -version", { stdio: "ignore" });
  console.log("✅ ffmpeg найден в системе");
} catch (err) {
  console.error("❌ ffmpeg не найден! Проверь установку в nixpacks.toml");
  process.exit(1);
}

// Создаём бота
const bot = new Telegraf(BOT_TOKEN);
const app = express();

// Команда /start
bot.start((ctx) =>
  ctx.reply("🎬 Отправь мне видео — я обрежу до 60 секунд, сделаю квадрат 1:1 и верну кружок со звуком.")
);

// Проверяем, видео ли это
const isVideo = (file) => file?.mime_type?.startsWith("video/");

// Обработка видео
bot.on(["video", "document"], async (ctx) => {
  let inputFile = null;
  let outputFile = null;

  try {
    const file =
      ctx.message.video ||
      (isVideo(ctx.message.document) ? ctx.message.document : null);

    if (!file) {
      return ctx.reply("⚠️ Это не видео. Пришли файл с видео или видео-документ.");
    }

    const fileLink = await ctx.telegram.getFileLink(file.file_id);
    const response = await fetch(fileLink.href);
    if (!response.ok) throw new Error("Ошибка загрузки файла");

    inputFile = path.join(os.tmpdir(), `input_${Date.now()}.mp4`);
    outputFile = path.join(os.tmpdir(), `output_${Date.now()}.mp4`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(inputFile, buffer);

    await ctx.reply("⏳ Обрабатываю видео...");

    // FFmpeg команда
    const ffmpegArgs = [
      "-y",
      "-i", inputFile,
      "-t", "60",
      "-vf", "crop='min(iw,ih)':'min(iw,ih)',scale=480:480,fps=30",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outputFile,
    ];

    await new Promise((resolve, reject) => {
      const ff = spawn("ffmpeg", ffmpegArgs);
      ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg exited with code ${code}`))));
      ff.on("error", reject);
    });

    await ctx.replyWithVideoNote({ source: outputFile });
    console.log("✅ Видео обработано успешно");

  } catch (err) {
    console.error("❌ Ошибка обработки видео:", err);
    await ctx.reply("❌ Не удалось обработать видео. Попробуй другое или короче 60 сек.");
  } finally {
    try {
      if (inputFile && fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
      if (outputFile && fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    } catch {}
  }
});

// === ТОЛЬКО WEBHOOK, НИКАКОГО POLLING ===
(async () => {
  try {
    if (!DOMAIN) {
      console.error("❌ DOMAIN (RAILWAY_STATIC_URL) не задан!");
      process.exit(1);
    }

    const webhookPath = `/webhook/${BOT_TOKEN}`;
    const webhookUrl = `https://${DOMAIN}${webhookPath}`;

    console.log("🧹 Сбрасываю старые webhook и polling...");
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });

    console.log("⚙️ Устанавливаю новый webhook...");
    await bot.telegram.setWebhook(webhookUrl);

    app.use(bot.webhookCallback(webhookPath));
    app.get("/", (req, res) => res.send("✅ VideoCircleBot работает на Railway (Webhook Mode)"));

    app.listen(PORT, () => {
      console.log(`🚀 Webhook активен: ${webhookUrl}`);
      console.log("✅ Бот готов принимать видео через Telegram!");
    });
  } catch (err) {
    console.error("🔥 Ошибка при установке webhook:", err);
  }
})();
