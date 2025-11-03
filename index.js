import express from "express";
import { Telegraf } from "telegraf";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BOT_TOKEN = process.env.BOT_TOKEN;
const DOMAIN = process.env.RAILWAY_STATIC_URL;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is not set.");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();

const isVideoDocument = (doc) => doc?.mime_type?.startsWith("video/") ?? false;

// === Основная логика ===
bot.start((ctx) =>
  ctx.reply("🎬 Отправь видео — я обрежу до 60 сек, сделаю 1:1 и верну кружок со звуком.")
);

bot.on(["video", "document"], async (ctx) => {
  let tempInput = null;
  let tempOutput = null;

  try {
    const fileId =
      ctx.message.video?.file_id ??
      (isVideoDocument(ctx.message.document)
        ? ctx.message.document.file_id
        : null);

    if (!fileId) return ctx.reply("⚠️ Пришлите видео или видео-файл.");

    const waitMsg = await ctx.reply("⏳ Обрабатываю видео...");
    await ctx.telegram.sendChatAction(ctx.chat.id, "upload_video_note");

    const file = await ctx.telegram.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`Не удалось скачать: ${res.statusText}`);

    // сохраняем видео во временный файл
    tempInput = path.join(os.tmpdir(), `input_${Date.now()}.mp4`);
    tempOutput = path.join(os.tmpdir(), `output_${Date.now()}.mp4`);
    fs.writeFileSync(tempInput, Buffer.from(await res.arrayBuffer()));

    // запускаем ffmpeg
    const ffmpegArgs = [
      "-y",
      "-i", tempInput,
      "-t", "60",
      "-vf", "crop='min(iw,ih)':'min(iw,ih)',scale=480:480,fps=30",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      tempOutput
    ];

    await new Promise((resolve, reject) => {
      const ff = spawn("ffmpeg", ffmpegArgs);
      ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg exited ${code}`))));
      ff.on("error", reject);
    });

    const outBuffer = fs.readFileSync(tempOutput);
    await ctx.replyWithVideoNote(
      { source: outBuffer, filename: "circle.mp4" },
      { length: 480, duration: 60 }
    );

    await ctx.deleteMessage(waitMsg.message_id);
  } catch (err) {
    console.error("❌ Ошибка обработки видео:", err);
    await ctx.reply("Не удалось обработать видео. Попробуйте другое.");
  } finally {
    try {
      if (tempInput && fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
      if (tempOutput && fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
    } catch {}
  }
});

// === ПРОДАКШЕН-ЗАПУСК ===

// Автоматический сброс старых polling/webhook соединений
(async () => {
  try {
    console.log("🧹 Сброс старых polling/webhook соединений...");
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    await new Promise((r) => setTimeout(r, 1000));

    const webhookPath = `/webhook/${BOT_TOKEN}`;
    const webhookURL = `https://${DOMAIN}${webhookPath}`;

    await bot.telegram.setWebhook(webhookURL);
    app.use(bot.webhookCallback(webhookPath));

    app.get("/", (req, res) => res.send("✅ Telegram bot is running on Railway with Webhook."));
    app.listen(PORT, () =>
      console.log(`🚀 Webhook mode active: ${webhookURL}`)
    );
  } catch (err) {
    console.error("🔥 Ошибка при настройке webhook:", err);
  }
})();
