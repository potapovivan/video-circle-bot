require("dotenv").config();
const { Telegraf } = require("telegraf");
const fs = require("fs-extra");
const ffmpeg = require("fluent-ffmpeg");

// ✅ Используем встроенный fetch (Node 18+)
const fetch = global.fetch;

// const ffmpegPath = "C:/Users/User/Desktop/сборщики/ffmpeg-2025-10-30-git-00c23bafb0-essentials_build/bin/ffmpeg.exe";
// ffmpeg.setFfmpegPath(ffmpegPath);


const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) =>
  ctx.reply("Привет! Пришли мне видео, я сделаю из него кружок 🎥")
);

// Когда пользователь присылает обычное видео
bot.on("video", async (ctx) => {
  try {
    await ctx.reply("🎬 Обрабатываю видео, немного подожди...");

    // 1️⃣ Получаем ссылку на видео-файл
    const fileId = ctx.message.video.file_id;
    const fileInfo = await ctx.telegram.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;

    // 2️⃣ Скачиваем видео во временный файл
    const inputFile = `./temp_input_${Date.now()}.mp4`;
    const outputFile = `./temp_output_${Date.now()}.mp4`;

    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(inputFile, Buffer.from(arrayBuffer));

    // 3️⃣ Обрезаем и делаем квадрат через ffmpeg
    await new Promise((resolve, reject) => {
      ffmpeg(inputFile)
        .setDuration(60) // максимум 60 секунд
        .videoFilter("crop=min(iw\\,ih):min(iw\\,ih),scale=512:512")
        .outputOptions(["-c:v libx264", "-preset veryfast", "-pix_fmt yuv420p"])
        .save(outputFile)
        .on("end", resolve)
        .on("error", reject);
    });

    // 4️⃣ Отправляем готовое видео как “кружочек”
    await ctx.replyWithVideoNote({ source: outputFile });

    // 5️⃣ Удаляем временные файлы
    await fs.remove(inputFile);
    await fs.remove(outputFile);

    console.log("✅ Кружок отправлен!");
  } catch (err) {
    console.error("Ошибка при обработке:", err);
    await ctx.reply(`❌ Что-то пошло не так: ${err.message}`);
  }
});

// Если прислали уже кружочек
bot.on("video_note", async (ctx) => {
  await ctx.reply("Это уже кружочек 😎");
});

bot.launch().then(() => console.log("🤖 Бот запущен и ждёт видео!"));
