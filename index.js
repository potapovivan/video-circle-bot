import express from "express";
import { Telegraf } from "telegraf";
import { spawn } from "node:child_process";
import { execSync } from "child_process";
import fs from "fs";

const BOT_TOKEN = process.env.BOT_TOKEN;
const RAILWAY_STATIC_URL = process.env.RAILWAY_STATIC_URL;

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is not set. Add it in Railway → Variables.");
  process.exit(1);
}

// Проверяем, что ffmpeg есть в PATH
try {
  execSync("ffmpeg -version", { stdio: "inherit" });
  console.log("✅ ffmpeg detected in PATH");
} catch (err) {
  console.error("❌ ffmpeg not found! Make sure it's installed in Railway.");
}

const bot = new Telegraf(BOT_TOKEN);

// Универсальный фильтр — видео или документ с видео
const isVideoDoc = (doc) => doc?.mime_type?.startsWith("video/");

bot.start(async (ctx) => {
  await ctx.reply(
    "🎥 Пришли мне видео — я обрежу до 60 сек, сделаю 1:1 и верну кружок со звуком.\n" +
    "Поддерживаются обычные видео или видео-файл как документ."
  );
});

// Основной обработчик видео
bot.on(["video", "document"], async (ctx) => {
  try {
    const file = ctx.message.video || ctx.message.document;
    if (!isVideoDoc(file)) return;

    const fileId = file.file_id;
    const fileUrl = await ctx.telegram.getFileLink(fileId);

    const inputPath = `/tmp/input_${Date.now()}.mp4`;
    const outputPath = `/tmp/output_${Date.now()}.mp4`;

    // Скачиваем файл
    const res = await fetch(fileUrl.href);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(inputPath, buffer);

    await ctx.reply("⏳ Обрабатываю видео...");

    // ffmpeg обработка
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-y",
        "-i", inputPath,
        "-t", "60",
        "-vf", "crop='min(iw,ih)':'min(iw,ih)',scale=480:480,fps=30",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        outputPath
      ]);

      ffmpeg.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });
    });

    await ctx.replyWithVideoNote({ source: outputPath });
    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

  } catch (err) {
    console.error("❌ Ошибка обработки видео:", err);
    await ctx.reply("❌ Не удалось обработать видео. Попробуй другое или короче 60 сек.");
  }
});

const app = express();
app.use(express.json());
app.get("/", (req, res) => res.send("✅ VideoCircleBot running via Railway"));

if (RAILWAY_STATIC_URL) {
  const webhookUrl = `${RAILWAY_STATIC_URL}/webhook/${BOT_TOKEN}`;
  bot.telegram.setWebhook(webhookUrl);
  app.use(bot.webhookCallback(`/webhook/${BOT_TOKEN}`));
  app.listen(3000, () => console.log(`🚀 Webhook mode: ${webhookUrl}`));
} else {
  bot.launch();
  console.log("🚀 Polling mode (local dev)");
}

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
