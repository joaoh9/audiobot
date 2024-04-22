const { spawn } = require('child_process');
const fs = require('fs');
const axios = require('axios');
const { createCanvas } = require('canvas');

require('dotenv').config();
const apiKeyGoogleTTS = process.env.GOOGLE_TTS_API_KEY;

function readTextFile(arquivo) {
  return new Promise((resolve, reject) => {
    fs.readFile(arquivo, 'utf8', (err, dados) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(dados);
    });
  });
}

function textToSpeech(texto) {
  return new Promise((resolve, reject) => {
    const urlAPI = `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${apiKeyGoogleTTS}`;
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    axios
      .post(
        urlAPI,
        JSON.stringify({
          voice: {
            languageCode: 'pt-BR',
            name: 'pt-BR-Standard-B',
            ssmlGender: 'MALE',
          },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: 1.2,
          },
          input: {
            text: texto,
          },
        }),
        options,
      )
      .then(response => {
        const audioContent = response.data.audioContent; // Base64 do áudio
        resolve(audioContent);
      })
      .catch(error => {
        reject(error);
      });
  });
}

function generateImage(texto, bookName, author) {
  const height = 1080;
  const width = 1920;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background color
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, canvas.width, canvas.height); // Fill canvas with background color

  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = `${height / 7}px Arial bold`;
  ctx.fillText(author, canvas.width / 2, 150);
  ctx.font = `${height / 10}px Arial`;
  ctx.fillText(bookName, canvas.width / 2, 290);

  const linhasTexto = texto.split('\n');
  let y = height / 2; // Initial text position
  for (const linha of linhasTexto) {
    ctx.fillText(linha, canvas.width / 2, y);
    y += 150; // Line spacing
  }

  return canvas;
}

function savePngImage(canvas, pngFileName) {
  const dataURL = canvas.toDataURL('image/png');

  const binData = dataURL.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(binData, 'base64');

  return new Promise((resolve, reject) => {
    fs.promises
      .writeFile(pngFileName, buffer)
      .then(() => {
        console.log(`Image successfully saved at: ${pngFileName}`);
        return resolve();
      })
      .catch(error => {
        console.error('Error saving image:', error);
        return reject();
      });
  });
}

async function saveMp3Audio(audioBase64, mp3FileName) {
  const audioBuffer = Buffer.from(audioBase64, 'base64');

  await fs.promises.writeFile(mp3FileName, audioBuffer);
}

async function generateVideo(imagePath, audioPath, outputVideoPath) {
  // Construct the FFmpeg command
  const ffmpegCommand = `ffmpeg -loop 1 -i '${imagePath}' -i '${audioPath}' -c:v libx264 -c:a copy -shortest '${outputVideoPath}'`;

  // Spawn the FFmpeg process
  const ffmpegProcess = spawn(ffmpegCommand, { shell: true });

  // Handle FFmpeg process output
  ffmpegProcess.stdout.on('data', data => {
    console.log(data.toString());
  });

  ffmpegProcess.stderr.on('data', data => {
    console.error(data.toString());
  });

  // Wait for FFmpeg process to finish
  return new Promise((resolve, reject) => {
    ffmpegProcess.on('exit', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg process exited with code: ${code}`));
      }
    });
  });
}

const byteSize = str => new Blob([str]).size;

async function runEverything() {
  const folderPath = process.env.FOLDER_PATH;
  const folderName = process.env.FOLDER_NAME;
  const bookName = process.env.BOOK_NAME;
  const author = process.env.AUTHOR;
  const resultFolder = process.env.RESULT_FOLDER;
  
  const files = fs.readdirSync(folderPath);
  for (const file of files) {
    try {
      const fileName = file.replace('.txt', '');

      const textFile = await readTextFile(`${folderName}/${file}`);

      const textBytes = byteSize(textFile);

      let mp3 = '';

      if (textBytes >= 5000) {
        const runs = Math.floor(textBytes / 5000) + 3;
        const splitedRes = textFile.split('.\n');
        console.log(`File ${fileName} too big, we'll make ${runs} requests to generate the mp3`);
        for (let i = 0; i < splitedRes.length; i += 2) {
          console.log(`Request #${i}`);
          try {
            mp3 += await textToSpeech([...splitedRes].slice(i, i + 2).join('.\n'));
          } catch (err) {
            if (
              err?.response?.data?.error?.message ===
              'Either `input.text` or `input.ssml` is longer than the limit of 5000 bytes. This limit is different from quotas. To fix, reduce the byte length of the characters in this request, or consider using the Long Audio API: https://cloud.google.com/text-to-speech/docs/create-audio-text-long-audio-synthesis.'
            ) {
              mp3 += await textToSpeech([...splitedRes].slice(i, i + 1).join('.\n'));
              mp3 += await textToSpeech([...splitedRes].slice(i + 1, i + 2).join('.\n'));
            } else {
              console.log('Something went wrong when generating the speech file.');
            }
          }
        }
      } else {
        mp3 = await textToSpeech(textFile);
      }

      await saveMp3Audio(mp3, `${resultFolder}/${fileName}.mp3`);

      console.log(`file ${fileName}.mp3 generated!`);

      await savePngImage(
        generateImage(fileName, bookName, author),
        `${resultFolder}/${fileName}.png`,
      );

      console.log(`image ${fileName}.png generated!`);

      await generateVideo(
        `${resultFolder}/${fileName}.png`,
        `${resultFolder}/${fileName}.mp3`,
        `${resultFolder}/${fileName}.mp4`,
      );

      console.log(`vídeo ${fileName}.mp4 generated!`);
    } catch (err) {
      console.log('🚀 ~ runEverything ~ err:', err?.response?.data?.error || err);
    }
  }
}

runEverything();
