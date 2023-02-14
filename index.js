import { createWriteStream, statSync } from "node:fs";
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

const padTwoDigits = (num) => String(num).padStart(2, "0");
const getWeekday = (date) => date.getDay();
const getYYYYMMDD = (date) =>
  [
    date.getFullYear(),
    padTwoDigits(date.getMonth() + 1),
    padTwoDigits(date.getDate()),
  ].join("-");

const __dirname = dirname(fileURLToPath(import.meta.url));
const nowUTC = new Date();
const weekdayUTC = getWeekday(nowUTC);
const yyyymmddUTC = getYYYYMMDD(nowUTC);
// const nowETLocaleString = nowUTC.toLocaleString("en-US", {
//   timeZone: "America/New_York",
// });
// const nowET = new Date(nowETLocaleString);
// const weekdayET = getWeekday(nowET);
// const yyyymmddET = getYYYYMMDD(nowET);

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

const FILE_NAME_MAPPINGS = [
  [/(\d{4})-(\d{2})-(\d{2})-guardian-cryptic/, "gdn.cryptic.$1$2$3"],
  [/(\d{4})-(\d{2})-(\d{2})-guardian-quick/, "gdn.quick.$1$2$3"],
  [/(\d{4})-(\d{2})-(\d{2})-wsj-number/, "WSJ_$2$3"],
  [/(\d{4})-(\d{2})-(\d{2})-wsj-standard/, "XWD$2$3$1"],
  [/(\d{4})-(\d{2})-(\d{2})-wsj-variety/, "SatPuz$2$3$1"],
];

const URL_BASE_MAPPINGS = {
  guardian: "https://crosswords-static.guim.co.uk/",
  wsj: "https://s.wsj.net/public/resources/documents/",
};

const getFileURLAndPath = (fileName) => {
  const base = URL_BASE_MAPPINGS[fileName.match(/\d{4}-\d{2}-\d{2}-(\w+)/)[1]];
  const [pattern, replacement] = FILE_NAME_MAPPINGS.find(([pattern]) =>
    pattern.test(fileName)
  );
  const mappedFileName = fileName.replace(pattern, replacement);

  return [`${base}${mappedFileName}`, join(__dirname, fileName)];
};

const downloadFile = async (fileURL, filePath) =>
  finished(
    Readable.fromWeb((await fetch(fileURL)).body).pipe(
      createWriteStream(filePath)
    )
  );

const deliverFile = async (fileName, folderId, token) => {
  const [fileURL, filePath] = getFileURLAndPath(fileName);
  const items = await fileList(token, folderId);
  const isFileAlreadyDelivered = items.some(
    (item) => item.fileName === fileName
  );

  if (isFileAlreadyDelivered) {
    console.log(`${fileName} has already been delivered.`);

    return Promise.resolve();
  }

  await downloadFile(fileURL, filePath);

  const { size } = statSync(filePath);

  if (size < 4096) {
    console.log(
      `${fileURL} is not available yet, or the URL prediction has failed for today.`
    );

    return Promise.resolve();
  }

  await uploadFile(token, filePath, folderId);
};

(async () => {
  const token = await login(email, password);
  const folderId = await getUploadFolderId("Document/Crosswords", token);
  const deliveries = [];

  if (weekdayUTC !== 0) {
    console.log(`Delivering today's Guardian cryptic puzzle.`);
    deliveries.push(
      deliverFile(`${yyyymmddUTC}-guardian-cryptic.pdf`, folderId, token)
    );

    console.log(`Delivering today's Guardian quick puzzle.`);
    deliveries.push(
      deliverFile(`${yyyymmddUTC}-guardian-quick.pdf`, folderId, token)
    );
  }

  // if (weekdayET !== 0) {
  if (weekdayUTC !== 0) {
    console.log(`Delivering today's WSJ standard puzzle.`);
    deliveries.push(
      // deliverFile(`${yyyymmddET}-wsj-standard.pdf`, folderId, token)
      deliverFile(`${yyyymmddUTC}-wsj-standard.pdf`, folderId, token)
    );

    // if (weekdayET === 6) {
    if (weekdayUTC === 6) {
      console.log(`Delivering today's WSJ number puzzle.`);
      deliveries.push(
        // deliverFile(`${yyyymmddET}-wsj-number.pdf`, folderId, token)
        deliverFile(`${yyyymmddUTC}-wsj-number.pdf`, folderId, token)
      );

      console.log(`Delivering today's WSJ variety puzzle.`);
      deliveries.push(
        // deliverFile(`${yyyymmddET}-wsj-variety.pdf`, folderId, token)
        deliverFile(`${yyyymmddUTC}-wsj-variety.pdf`, folderId, token)
      );
    }
  }

  await Promise.all(deliveries);
})();
