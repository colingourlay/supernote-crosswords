import { createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { fileList, login, uploadFile } from "@colingourlay/supernote-cloud-api";

const email = process.env.SUPERNOTE_CLOUD_EMAIL;
const password = process.env.SUPERNOTE_CLOUD_PASSWORD;

if (!email || !password) {
  console.error("Missing email or password environment variables");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const nowUTC = new Date();
const nowNYLocaleString = nowUTC.toLocaleString("en-US", {
  timeZone: "America/New_York",
});
const now = new Date(nowNYLocaleString);
const weekday = now.getDay();
const padTwoDigits = (num) => String(num).padStart(2, "0");
const mdy = [
  padTwoDigits(now.getMonth() + 1),
  padTwoDigits(now.getDate()),
  now.getFullYear(),
].join("");

const getUploadFolderId = async (folderPath, token) => {
  const pathSegments = folderPath.split("/");

  if (pathSegments[0] !== "Document") {
    pathSegments.unshift("Document");
  }

  let folderId = undefined;

  for (let pathSegment of pathSegments) {
    const items = await fileList(token, folderId);
    const [folder] = items.filter(
      ({ fileName, isFolder }) => isFolder === "Y" && fileName === pathSegment
    );

    folderId = folder.id;
  }

  return folderId;
};

const getFileURLAndPath = (fileName) => [
  `https://s.wsj.net/public/resources/documents/${fileName}`,
  join(__dirname, fileName),
];

const downloadFile = async (fileURL, filePath) =>
  finished(
    Readable.fromWeb((await fetch(fileURL)).body).pipe(
      createWriteStream(filePath)
    )
  );

const deliverFile = async (fileName, folderId, token) => {
  const [fileURL, filePath] = getFileURLAndPath(fileName);

  await downloadFile(fileURL, filePath);
  await uploadFile(token, filePath, folderId);
};

(async () => {
  if (weekday === 0) {
    console.log("Today is Sunday. No puzzles to deliver.");

    return;
  }

  const token = await login(email, password);
  const folderId = await getUploadFolderId("Document/Crosswords", token);
  const deliveries = [];

  console.log(`Delivering today's standard puzzle.`);
  deliveries.push(deliverFile(`XWD${mdy}.pdf`, folderId, token));

  if (weekday === 6) {
    console.log(`Delivering today's number puzzle.`);
    deliveries.push(deliverFile(`WSJ_${mdy.slice(0, 4)}.pdf`, folderId, token));

    console.log(`Delivering today's variety puzzle.`);
    deliveries.push(deliverFile(`SatPuz${mdy}.pdf`, folderId, token));
  }

  await Promise.all(deliveries);
})();
