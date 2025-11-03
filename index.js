import { Telegraf } from "telegraf";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is not set.");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// проверка: видео или нет
const isVideoDocument = (doc) => doc?.mime_type?.startsWith("video/") ?? false;

bot.start((ctx) =>
  ctx.reply(
    "🎥 Пришли видео — я обрежу до 60 сек, сделаю 1:1 и верну видео-кружок со звуком."
  )
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

    // === сохраняем видео во временный файл ===
    tempInput = path.join(os.tmpdir(), `input_${Date.now()}.mp4`);
    tempOutput = path.join(os.tmpdir(), `output_${Date.now()}.mp4`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tempInput, buffer);

    // === запускаем ffmpeg ===
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

    const ff = spawn("ffmpeg", ffmpegArgs, { stdio: ["ignore", "pipe", "pipe"] });

    ff.stderr.on("data", (d) => {
      const s = d.toString();
      if (s.toLowerCase().includes("error")) console.log("🧩 ffmpeg:", s);
    });

    await new Promise((resolve, reject) => {
      ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg exited ${code}`))));
      ff.on("error", reject);
    });

    // === читаем готовый файл и отправляем как кружок ===
    const outBuffer = fs.readFileSync(tempOutput);
    if (!outBuffer.length) throw new Error("FFmpeg output empty");

    await ctx.replyWithVideoNote(
      { source: outBuffer, filename: "circle.mp4" },
      { length: 480, duration: 60 }
    );

    await ctx.deleteMessage(waitMsg.message_id);
  } catch (err) {
    console.error("❌ Ошибка обработки видео:", err);
    await ctx.reply("Не удалось обработать видео. Попробуйте другое или короче 60 сек.");
  } finally {
    // удаляем временные файлы
    try {
      if (tempInput && fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
      if (tempOutput && fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
    } catch {}
  }
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

bot.launch().then(() => console.log("✅ Bot is up and running."));
