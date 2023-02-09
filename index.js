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
const today = new Date();
const todayNYLocaleString = today.toLocaleString("en-US", {
  timeZone: "America/New_York",
});
const todayNYDate = new Date(todayNYLocaleString);
const fileName = `XWD${String(todayNYDate.getMonth() + 1).padStart(
  2,
  "0"
)}${String(todayNYDate.getDate()).padStart(
  2,
  "0"
)}${todayNYDate.getFullYear()}.pdf`;
const fileURL = `https://s.wsj.net/public/resources/documents/${fileName}`;
const filePath = join(__dirname, fileName);

(async () => {
  const download = finished(
    Readable.fromWeb((await fetch(fileURL)).body).pipe(
      createWriteStream(filePath)
    )
  );
  const token = await login(email, password);
  const folders = await fileList(token);
  const [documentFolder] = folders.filter(
    ({ fileName }) => fileName === "Document"
  );
  const documentFolders = await fileList(token, documentFolder.id);
  const [crosswordsFolder] = documentFolders.filter(
    ({ fileName }) => fileName === "Crosswords"
  );

  await download;
  await uploadFile(token, filePath, crosswordsFolder.id);
})();
